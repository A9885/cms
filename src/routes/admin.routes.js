const express = require('express');
const router = express.Router();
const { dbRun, dbAll, dbGet } = require('../db/database');
const xiboService = require('../services/xibo.service');
const statsService = require('../services/stats.service');

// ─── DASHBOARD OVERVIEW ───

/**
 * GET /api/admin/dashboard
 * Returns global network KPIs including screen status, active campaigns, 
 * current impressions, and revenue trends. Parallelized for efficiency.
 */
router.get('/dashboard', async (req, res) => {
    try {
        const [
            totalBrandsObj,
            totalPartnersObj,
            monthlyRevenueObj,
            displays,
            campaignsRes,
            totalSlotsObj,
            assignedSlotsObj,
            revenueTrend,
            allStats
        ] = await Promise.all([
            dbGet('SELECT COUNT(*) as count FROM brands'),
            dbGet('SELECT COUNT(*) as count FROM partners'),
            dbGet("SELECT SUM(amount) as total FROM invoices WHERE status = 'Paid'"),
            xiboService.getDisplays(),
            xiboService.getCampaigns().catch(e => {
                console.error('Failed to fetch Campaigns:', e.message);
                return [];
            }),
            dbGet('SELECT COUNT(*) as count FROM slots'),
            dbGet('SELECT COUNT(*) as count FROM slots WHERE brand_id IS NOT NULL'),
            dbAll(`
                SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(amount) as total
                FROM invoices 
                WHERE status = 'Paid'
                GROUP BY month 
                ORDER BY month ASC 
                LIMIT 6
            `),
            require('../services/stats.service').getAllMediaStats()
        ]);
        
        const totalScreens = displays.length;
        const onlineScreens = displays.filter(d => d.loggedIn === 1 || d.loggedIn === true).length;
        const activeCampaigns = campaignsRes.length || 0;
        const availableSlotsCount = (totalSlotsObj && totalSlotsObj.count > 0) ? (totalSlotsObj.count - assignedSlotsObj.count) : (totalScreens * 20);

        let totalImpressions = 0;
        if (allStats) {
            Object.values(allStats).forEach(stat => {
                totalImpressions += (stat.totalPlays || 0);
            });
        }

        res.json({
            totalScreens,
            totalImpressions,
            onlineScreens,
            activeCampaigns,
            availableSlots: availableSlotsCount,
            totalBrands: totalBrandsObj.count,
            totalPartners: totalPartnersObj.count,
            monthlyRevenue: monthlyRevenueObj.total || 0,
            revenueTrend,
            recentAlerts: displays
                .filter(d => d.loggedIn === 0 || d.loggedIn === false)
                .slice(0, 5)
                .map(d => ({ type: 'danger', text: `Screen ${d.display} is currently offline` }))
        });
    } catch (err) {
        console.error('[Admin API] Dashboard Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── BRANDS ───

/** GET /api/admin/brands - List all registered brands. */
router.get('/brands', async (req, res) => {
    try {
        const brands = await dbAll('SELECT * FROM brands ORDER BY id DESC');
        res.json(brands);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/brands - Create a brand and provide default login credentials. */
router.post('/brands', async (req, res) => {
    const { name, industry, contact_person, email, phone, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await dbRun(
            `INSERT INTO brands (name, industry, contact_person, email, phone, status) VALUES (?, ?, ?, ?, ?, ?)`,
            [name, industry, contact_person, email, phone, status || 'Active']
        );
        
        if (email) {
            const bcrypt = require('bcryptjs');
            const hash = bcrypt.hashSync('Brand@123', 10);
            await dbRun(
                `INSERT INTO users (username, password_hash, role, brand_id, force_password_reset) VALUES (?, ?, 'Brand', ?, 1)`,
                [email, hash, result.id]
            ).catch(e => console.error('Failed to create user for brand:', e.message));
        }

        res.json({ success: true, id: result.id });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PUT /api/admin/brands/:id - Update brand profile. */
router.put('/brands/:id', async (req, res) => {
    const { name, industry, contact_person, email, phone, status } = req.body;
    try {
        await dbRun(
            `UPDATE brands SET name=?, industry=?, contact_person=?, email=?, phone=?, status=? WHERE id=?`,
            [name, industry, contact_person, email, phone, status, req.params.id]
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/brands/:id - Delete brand and clean up all associated slot allocations. */
router.delete('/brands/:id', async (req, res) => {
    const brandId = req.params.id;
    try {
        await dbRun('UPDATE slots SET brand_id = NULL, status = "Available" WHERE brand_id = ?', [brandId]);
        await dbRun('DELETE FROM media_brands WHERE brand_id = ?', [brandId]);
        await dbRun('UPDATE users SET brand_id = NULL WHERE brand_id = ?', [brandId]);
        await dbRun(`DELETE FROM brands WHERE id = ?`, [brandId]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── BRAND METRICS & CAMPAIGNS ───

/**
 * GET /api/admin/brands/:id/metrics
 * Aggregates performance data for a specific brand.
 */
router.get('/brands/:id/metrics', async (req, res) => {
    const brandId = req.params.id;
    try {
        const [campaignsCount, screensCount, spendSum, brandMedia] = await Promise.all([
            dbGet('SELECT COUNT(DISTINCT mediaId) as count FROM media_brands WHERE brand_id = ?', [brandId]),
            dbGet('SELECT COUNT(DISTINCT displayId) as count FROM slots WHERE brand_id = ?', [brandId]),
            dbGet('SELECT SUM(amount) as total FROM invoices WHERE brand_id = ?', [brandId]),
            dbAll('SELECT mediaId FROM media_brands WHERE brand_id = ?', [brandId])
        ]);
        
        let totalPlays = 0;
        try {
            if (brandMedia && brandMedia.length > 0) {
                const statsService = require('../services/stats.service');
                const summary = await statsService.getAllMediaStats();
                brandMedia.forEach(bm => {
                    const match = summary.find(s => String(s.mediaId) === String(bm.mediaId));
                    if (match) totalPlays += (match.totalPlays || 0);
                });
            }
        } catch(e) {
            console.error('[Admin API] Failed to fetch real PoP for brand ' + brandId, e.message);
        }

        res.json({
            totalCampaigns: campaignsCount.count || 0,
            totalScreens: screensCount.count || 0,
            totalSpend: spendSum.total || 0,
            totalPlays: totalPlays
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** GET /api/admin/brands/:id/campaigns - List all campaigns (media) for a specific brand. */
router.get('/brands/:id/campaigns', async (req, res) => {
    const brandId = req.params.id;
    try {
        const localCampaigns = await dbAll(`
            SELECT mb.mediaId, s.displayId, s.slot_number, s.status, s.updated_at
            FROM media_brands mb
            LEFT JOIN slots s ON mb.brand_id = s.brand_id
            WHERE mb.brand_id = ?
        `, [brandId]);

        if (localCampaigns.length === 0) return res.json([]);

        const library = await xiboService.getLibrary({ length: 500 });
        const mediaMap = {};
        library.forEach(m => { mediaMap[m.mediaId] = m.name; });

        const enriched = localCampaigns.map(c => ({
            ...c,
            mediaName: mediaMap[c.mediaId] || `Media #${c.mediaId}`
        }));
        
        res.json(enriched);
    } catch (err) {
        console.error('[Admin API] Brand Campaigns Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── PARTNERS ───

/** GET /api/admin/partners - List all screen partners with screen counts. */
router.get('/partners', async (req, res) => {
    try {
        const partners = await dbAll(`
            SELECT p.*, COUNT(s.id) as screen_count
            FROM partners p
            LEFT JOIN screens s ON p.id = s.partner_id
            GROUP BY p.id
            ORDER BY p.id DESC
        `);
        res.json(partners);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/partners - Register a new screen partner and create a user account. */
router.post('/partners', async (req, res) => {
    const { name, company, email, phone, address, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await dbRun(
            `INSERT INTO partners (name, company, email, phone, address, status) VALUES (?, ?, ?, ?, ?, ?)`,
            [name, company, email, phone, address, status || 'Active']
        );

        if (email) {
            const bcrypt = require('bcryptjs');
            const hash = bcrypt.hashSync('partner123', 10);
            await dbRun(
                `INSERT INTO users (username, password_hash, role, partner_id) VALUES (?, ?, 'Partner', ?)`,
                [email, hash, result.id]
            ).catch(e => console.error('Failed to create user for partner:', e.message));
        }

        res.json({ success: true, id: result.id });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PUT /api/admin/partners/:id - Update partner profile. */
router.put('/partners/:id', async (req, res) => {
    const { name, company, email, phone, address, status } = req.body;
    try {
        await dbRun(
            `UPDATE partners SET name=?, company=?, email=?, phone=?, address=?, status=? WHERE id=?`,
            [name, company, email, phone, address, status, req.params.id]
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/partners/:id - Delete partner and unassign their screens. */
router.delete('/partners/:id', async (req, res) => {
    try {
        await dbRun('UPDATE screens SET partner_id = NULL WHERE partner_id = ?', [req.params.id]);
        await dbRun('UPDATE users SET partner_id = NULL WHERE partner_id = ?', [req.params.id]);
        await dbRun(`DELETE FROM partners WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/partners/:id/assign-screens - Bulk assign screens to a partner. */
router.post('/partners/:id/assign-screens', async (req, res) => {
    const partnerId = req.params.id;
    const { screenIds } = req.body; // Array of local screen IDs
    if (!Array.isArray(screenIds)) return res.status(400).json({ error: 'screenIds must be an array' });
    
    try {
        // First, unassign all screens currently belonging to this partner
        await dbRun('UPDATE screens SET partner_id = NULL WHERE partner_id = ?', [partnerId]);
        
        // Then, assign the new selection
        if (screenIds.length > 0) {
            const ph = screenIds.map(() => '?').join(',');
            await dbRun(`UPDATE screens SET partner_id = ? WHERE id IN (${ph})`, [partnerId, ...screenIds]);
        }
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── SCREENS ───

/**
 * GET /api/admin/screens
 * Syncs Xibo displays with the local database and returns the full list of screens.
 */
router.get('/screens', async (req, res) => {
    try {
        const screenService = require('../services/screen.service');
        await screenService.syncDisplays();

        const screens = await dbAll(`
            SELECT s.*, p.name as partner_name 
            FROM screens s
            LEFT JOIN partners p ON s.partner_id = p.id
            ORDER BY s.id DESC
        `);
        res.json(screens);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/screens - Add a new screen to the CRM. */
router.post('/screens', async (req, res) => {
    const { name, city, address, latitude, longitude, timezone, partner_id, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await dbRun(
            `INSERT INTO screens (name, city, address, latitude, longitude, timezone, partner_id, notes, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Offline')`,
            [name, city, address, latitude, longitude, timezone || 'Asia/Kolkata', partner_id || null, notes]
        );
        res.json({ success: true, id: result.id });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PUT /api/admin/screens/:id - Update screen details. */
router.put('/screens/:id', async (req, res) => {
    let { name, city, address, latitude, longitude, timezone, partner_id, notes, xibo_display_id, status } = req.body;
    
    // Sanitize coordinates to handle empty strings or UI nulls
    if (latitude === '' || latitude === undefined) latitude = null;
    if (longitude === '' || longitude === undefined) longitude = null;
    if (latitude !== null) latitude = parseFloat(latitude);
    if (longitude !== null) longitude = parseFloat(longitude);

    try {
        await dbRun(
            `UPDATE screens SET name=?, city=?, address=?, latitude=?, longitude=?, timezone=?, partner_id=?, notes=?, xibo_display_id=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [name, city, address, latitude, longitude, timezone, partner_id, notes, xibo_display_id, status, req.params.id]
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/screens/:id/sync-location', async (req, res) => {
    try {
        const screen = await dbGet('SELECT xibo_display_id FROM screens WHERE id = ?', [req.params.id]);
        if (!screen || !screen.xibo_display_id) {
            return res.status(404).json({ error: 'Screen not linked to Xibo player' });
        }
        
        const screenService = require('../services/screen.service');
        await screenService.syncLocation(screen.xibo_display_id);
        
        const updated = await dbGet('SELECT latitude, longitude, address FROM screens WHERE id = ?', [req.params.id]);
        res.json({ success: true, location: updated });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/screens/:id - Delete screen from the local records. */
router.delete('/screens/:id', async (req, res) => {
    try {
        const screen = await dbGet('SELECT xibo_display_id FROM screens WHERE id = ?', [req.params.id]);
        if (screen && screen.xibo_display_id) {
            await dbRun('DELETE FROM slots WHERE displayId = ?', [screen.xibo_display_id]);
            await dbRun('DELETE FROM screen_partners WHERE displayId = ?', [screen.xibo_display_id]);
        }
        await dbRun(`DELETE FROM screens WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/admin/screens/:id/proof-of-play
 * Returns recent playback logs for a specific screen.
 */
router.get('/screens/:id/proof-of-play', async (req, res) => {
    try {
        const screen = await dbGet('SELECT * FROM screens WHERE id = ?', [req.params.id]);
        if (!screen || !screen.xibo_display_id) return res.json([]);

        const statsService = require('../services/stats.service');
        const recent = await statsService.getRecentStats();
        const screenStats = recent.data.filter(r => String(r.displayId) === String(screen.xibo_display_id)).slice(0, 50);
        res.json(screenStats);
    } catch(err) {
        console.error('[Admin API] Proof of Play Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── INVOICES / BILLING ───

/** GET /api/admin/invoices - List all billing records. */
router.get('/invoices', async (req, res) => {
    try {
        const invoices = await dbAll(`
            SELECT i.*, b.name as brand_name 
            FROM invoices i 
            LEFT JOIN brands b ON i.brand_id = b.id 
            ORDER BY i.created_at DESC
        `);
        res.json(invoices);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/invoices - Create a manual invoice for a brand. */
router.post('/invoices', async (req, res) => {
    const { invoice_number, brand_id, amount, status, due_date } = req.body;
    try {
        const result = await dbRun(
            `INSERT INTO invoices (invoice_number, brand_id, amount, status, due_date) VALUES (?, ?, ?, ?, ?)`,
            [invoice_number || 'INV-'+Date.now(), brand_id, amount, status || 'Pending', due_date]
        );
        res.json({ success: true, id: result.id });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── CAMPAIGNS (Real from Xibo CMS) ───

/** GET /api/admin/campaigns/recent - Fetch live campaign data from Xibo. */
router.get('/campaigns/recent', async (req, res) => {
    try {
        const campaigns = await xiboService.getCampaigns();
        const enhanced = campaigns.map(c => {
            return {
                id: c.campaignId,
                name: c.campaign,
                brandName: 'Unassigned',
                totalPlays: c.totalPlays || 0,
                status: c.campaignId ? 'Active' : 'Draft',
                isLayoutSpecific: c.isLayoutSpecific
            };
        });
        res.json(enhanced);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── INVENTORY / SLOTS ───

/** GET /api/admin/inventory - Returns a system-wide map of all slots grouped by display. */
router.get('/inventory', async (req, res) => {
    try {
        const slots = await dbAll(`
            SELECT s.*, b.name as brand_name 
            FROM slots s
            LEFT JOIN brands b ON s.brand_id = b.id
            ORDER BY s.displayId, s.slot_number
        `);
        
        const inventory = {};
        slots.forEach(s => {
            if (!inventory[s.displayId]) inventory[s.displayId] = [];
            inventory[s.displayId].push(s);
        });
        res.json(inventory);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/slots/assign - Allocate a specific slot to a brand. */
router.post('/slots/assign', async (req, res) => {
    const { displayId, slot_number, brand_id } = req.body;
    try {
        const slot = await dbGet('SELECT * FROM slots WHERE displayId = ? AND slot_number = ?', [displayId, slot_number]);
        if (slot) {
            await dbRun(
                `UPDATE slots SET brand_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
                 WHERE displayId = ? AND slot_number = ?`,
                [brand_id || null, brand_id ? 'Reserved' : 'Available', displayId, slot_number]
            );
        } else {
            await dbRun(
                'INSERT INTO slots (displayId, slot_number, brand_id, status) VALUES (?, ?, ?, ?)',
                [displayId, slot_number, brand_id, brand_id ? 'Reserved' : 'Available']
            );
        }

        const io = req.app.get('io');
        if (io) {
            let brandName = 'Unassigned';
            if (brand_id) {
                const brand = await dbGet('SELECT name FROM brands WHERE id = ?', [brand_id]);
                if (brand) brandName = brand.name;
            }
            io.emit('slot_assigned', { displayId, slot_number, brand_id: brand_id || null, brandName, timestamp: Date.now() });
        }
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/admin/slots/screen/:displayId - Get all 20 predefined slots for a specific screen. */
router.get('/slots/screen/:displayId', async (req, res) => {
    const { displayId } = req.params;
    try {
        const dbSlots = await dbAll(`
            SELECT sl.*, b.name as brand_name
            FROM slots sl
            LEFT JOIN brands b ON sl.brand_id = b.id
            WHERE sl.displayId = ?
            ORDER BY sl.slot_number
        `, [displayId]);

        const slotMap = {};
        dbSlots.forEach(s => { slotMap[s.slot_number] = s; });

        const fullSlots = Array.from({ length: 20 }, (_, i) => {
            const slotNum = i + 1;
            return slotMap[slotNum] || {
                displayId: parseInt(displayId, 10),
                slot_number: slotNum,
                brand_id: null,
                brand_name: null,
                status: 'Available'
            };
        });
        res.json(fullSlots);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
