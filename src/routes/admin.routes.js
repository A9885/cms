const express = require('express');
const router = express.Router();
const { dbRun, dbAll, dbGet } = require('../db/database');
const xiboService = require('../services/xibo.service');

// ─── DASHBOARD OVERVIEW ───
router.get('/dashboard', async (req, res) => {
    try {
        // Fetch from SQLite (CRM Data)
        const totalBrandsObj = await dbGet('SELECT COUNT(*) as count FROM brands');
        const totalPartnersObj = await dbGet('SELECT COUNT(*) as count FROM partners');
        const monthlyRevenueObj = await dbGet("SELECT SUM(amount) as total FROM invoices WHERE status = 'Paid'");
        
        // Fetch from Xibo API
        const displays = await xiboService.getDisplays();
        const totalScreens = displays.length;
        const onlineScreens = displays.filter(d => d.loggedIn === 1 || d.loggedIn === true).length;
        
        // Fetch real campaigns from Xibo
        let activeCampaigns = 0;
        try {
            const campaignsRes = await xiboService.getCampaigns();
            activeCampaigns = campaignsRes.length || 0;
        } catch(e) {
            console.error('Failed to fetch Campaigns:', e.message);
        }

        // Fetch real slots count (Phase 4)
        const totalSlotsObj = await dbGet('SELECT COUNT(*) as count FROM slots');
        const assignedSlotsObj = await dbGet('SELECT COUNT(*) as count FROM slots WHERE brand_id IS NOT NULL');
        const availableSlotsCount = (totalSlotsObj && totalSlotsObj.count > 0) ? (totalSlotsObj.count - assignedSlotsObj.count) : (totalScreens * 20);

        // Fetch Revenue Trend (Last 6 Months)
        const revenueTrend = await dbAll(`
            SELECT strftime('%Y-%m', created_at) as month, SUM(amount) as total 
            FROM invoices 
            WHERE status = 'Paid'
            GROUP BY month 
            ORDER BY month ASC 
            LIMIT 6
        `);

        // Calculate Real Total Impressions across the entire network natively
        const statsService = require('../services/stats.service');
        const allStats = await statsService.getAllMediaStats();
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
router.get('/brands', async (req, res) => {
    try {
        const brands = await dbAll('SELECT * FROM brands ORDER BY id DESC');
        res.json(brands);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

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
            const hash = bcrypt.hashSync('brand123', 10);
            await dbRun(
                `INSERT INTO users (username, password_hash, role, brand_id) VALUES (?, ?, 'Brand', ?)`,
                [email, hash, result.id]
            ).catch(e => console.error('Failed to create user for brand:', e.message));
        }

        res.json({ success: true, id: result.id });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

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

router.delete('/brands/:id', async (req, res) => {
    const brandId = req.params.id;
    try {
        // Cleanup references
        await dbRun('UPDATE slots SET brand_id = NULL, status = "Available" WHERE brand_id = ?', [brandId]);
        await dbRun('DELETE FROM media_brands WHERE brand_id = ?', [brandId]);
        await dbRun('UPDATE users SET brand_id = NULL WHERE brand_id = ?', [brandId]);
        
        await dbRun(`DELETE FROM brands WHERE id = ?`, [brandId]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── BRAND METRICS & CAMPAIGNS ───
router.get('/brands/:id/metrics', async (req, res) => {
    const brandId = req.params.id;
    try {
        // 1. Total Campaigns (Distinct mediaIds linked to this brand)
        const campaignsCount = await dbGet('SELECT COUNT(DISTINCT mediaId) as count FROM media_brands WHERE brand_id = ?', [brandId]);
        
        // 2. Total Screens (Distinct displayIds where this brand has a slot)
        const screensCount = await dbGet('SELECT COUNT(DISTINCT displayId) as count FROM slots WHERE brand_id = ?', [brandId]);
        
        // 3. Total Spend (Sum of invoice amounts)
        const spendSum = await dbGet('SELECT SUM(amount) as total FROM invoices WHERE brand_id = ?', [brandId]);
        
        // 4. Total Plays (Proof of Play - Real-time from StatsService)
        let totalPlays = 0;
        try {
            // First we find all media connected to this brand
            const brandMedia = await dbAll('SELECT mediaId FROM media_brands WHERE brand_id = ?', [brandId]);
            if (brandMedia && brandMedia.length > 0) {
                const statsService = require('../services/stats.service');
                // Get all media stats to sum plays
                const summary = await statsService.getAllMediaStats();
                
                brandMedia.forEach(bm => {
                    const match = summary.find(s => s.mediaId == bm.mediaId);
                    if (match) {
                        totalPlays += match.totalPlays;
                    }
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

router.get('/brands/:id/campaigns', async (req, res) => {
    const brandId = req.params.id;
    try {
        // 1. Fetch local assignments
        const localCampaigns = await dbAll(`
            SELECT mb.mediaId, s.displayId, s.slot_number, s.status, s.updated_at
            FROM media_brands mb
            LEFT JOIN slots s ON mb.brand_id = s.brand_id
            WHERE mb.brand_id = ?
        `, [brandId]);

        if (localCampaigns.length === 0) return res.json([]);

        // 2. Fetch Media Library from Xibo to get Names
        const library = await xiboService.getLibrary({ length: 500 });
        const mediaMap = {};
        library.forEach(m => { mediaMap[m.mediaId] = m.name; });

        // 3. Enrich local data
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
router.get('/partners', async (req, res) => {
    try {
        const partners = await dbAll('SELECT * FROM partners ORDER BY id DESC');
        res.json(partners);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/partners/stats', async (req, res) => {
    try {
        const stats = await dbAll(`
            SELECT p.id, COUNT(s.id) as screen_count
            FROM partners p
            LEFT JOIN screens s ON s.partner_id = p.id
            GROUP BY p.id
        `);
        res.json(stats);
    } catch(err) { res.status(500).json({ error: err.message }); }
});


router.post('/partners', async (req, res) => {
    const { name, company, city, email, phone, status, revenue_share_percentage } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await dbRun(
            `INSERT INTO partners (name, company, city, email, phone, status, revenue_share_percentage) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, company, city, email, phone, status || 'Active', revenue_share_percentage || 50]
        );
        
        // Auto-create a Partner portal login if email is provided
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


router.put('/partners/:id', async (req, res) => {
    const { name, company, city, email, phone, status, revenue_share_percentage } = req.body;
    try {
        await dbRun(
            `UPDATE partners SET name=?, company=?, city=?, email=?, phone=?, status=?, revenue_share_percentage=? WHERE id=?`,
            [name, company, city, email, phone, status, revenue_share_percentage, req.params.id]
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.delete('/partners/:id', async (req, res) => {
    try {
        await dbRun(`DELETE FROM partners WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── SCREENS (Local Management & Auto-Sync) ───
router.get('/screens', async (req, res) => {
    try {
        // 1. Auto-sync Xibo displays into local DB
        try {
            const displays = await xiboService.getDisplays();
            for (const d of displays) {
                const existing = await dbGet('SELECT id FROM screens WHERE xibo_display_id = ?', [d.displayId]);
                
                let status = 'Offline';
                if (d.licensed === 0) status = 'PendingAuth';
                else if (d.loggedIn) status = 'Online';
                
                if (!existing) {
                    // Check if there's a screen with same name but NO xibo_id
                    const byName = await dbGet('SELECT id FROM screens WHERE name = ? AND xibo_display_id IS NULL', [d.display]);
                    if (byName) {
                        await dbRun('UPDATE screens SET xibo_display_id = ?, status = ? WHERE id = ?', [d.displayId, status, byName.id]);
                    } else {
                        await dbRun(
                            `INSERT INTO screens (name, xibo_display_id, status) VALUES (?, ?, ?)`,
                            [d.display || 'Unknown', d.displayId, status]
                        );
                    }
                } else {
                    await dbRun('UPDATE screens SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, existing.id]);
                }
            }
        } catch(syncErr) {
            console.error('[Admin API] Auto-sync Xibo displays error:', syncErr.message);
        }

        // 2. Fetch returning data
        const screens = await dbAll(`
            SELECT s.*, p.name as partner_name 
            FROM screens s
            LEFT JOIN partners p ON s.partner_id = p.id
            ORDER BY s.id DESC
        `);
        res.json(screens);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

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

router.put('/screens/:id', async (req, res) => {
    const { name, city, address, latitude, longitude, timezone, partner_id, notes, xibo_display_id, status } = req.body;
    try {
        await dbRun(
            `UPDATE screens SET name=?, city=?, address=?, latitude=?, longitude=?, timezone=?, partner_id=?, notes=?, xibo_display_id=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [name, city, address, latitude, longitude, timezone, partner_id, notes, xibo_display_id, status, req.params.id]
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.delete('/screens/:id', async (req, res) => {
    try {
        await dbRun(`DELETE FROM screens WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/screens/:id/proof-of-play', async (req, res) => {
    try {
        const screen = await dbGet('SELECT * FROM screens WHERE id = ?', [req.params.id]);
        if (!screen || !screen.xibo_display_id) return res.json([]);

        const statsService = require('../services/stats.service');
        const recent = await statsService.getRecentStats();
        
        const screenStats = recent.data.filter(r => r.displayId == screen.xibo_display_id).slice(0, 50);
        res.json(screenStats);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});


// ─── INVOICES / BILLING ───
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
router.get('/campaigns/recent', async (req, res) => {
    try {
        const campaigns = await xiboService.getCampaigns();
        
        // Let's enhance this by attaching brand names if any media matches a brand
        const dbBrands = await dbAll('SELECT * FROM media_brands mb JOIN brands b ON mb.brand_id = b.id');
        
        const enhanced = campaigns.map(c => {
            // Check if campaign name has a known brand
            let brandName = 'Unassigned';
            return {
                id: c.campaignId,
                name: c.campaign,
                brandName: brandName, // Or extract from tags/names if available
                totalPlays: c.totalPlays || 0,
                status: c.campaignId ? 'Active' : 'Draft',
                isLayoutSpecific: c.isLayoutSpecific
            };
        });

        res.json(enhanced);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── INVENTORY / SLOTS (Phase 4) ───
router.get('/inventory', async (req, res) => {
    try {
        const slots = await dbAll(`
            SELECT s.*, b.name as brand_name 
            FROM slots s
            LEFT JOIN brands b ON s.brand_id = b.id
            ORDER BY s.displayId, s.slot_number
        `);
        
        // Group by displayId
        const inventory = {};
        slots.forEach(s => {
            if (!inventory[s.displayId]) inventory[s.displayId] = [];
            inventory[s.displayId].push(s);
        });
        
        res.json(inventory);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

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

        // Emit real-time slot_assigned event so Brand Portal refreshes instantly
        const io = req.app.get('io');
        if (io) {
            let brandName = 'Unassigned';
            if (brand_id) {
                const brand = await dbGet('SELECT name FROM brands WHERE id = ?', [brand_id]);
                if (brand) brandName = brand.name;
            }
            io.emit('slot_assigned', {
                displayId,
                slot_number,
                brand_id: brand_id || null,
                brandName,
                timestamp: Date.now()
            });
        }

        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── GET ALL 20 SLOTS FOR A GIVEN SCREEN ───
router.get('/slots/screen/:displayId', async (req, res) => {
    const { displayId } = req.params;
    try {
        const dbSlots = await dbAll(`
            SELECT sl.*, b.name as brand_name
            FROM slots sl
            LEFT JOIN brands b ON sl.brand_id = b.id
            WHERE sl.displayId = ?
        `, [displayId]);

        // Build a full 20-slot map so the UI always gets all slots
        const slotMap = {};
        dbSlots.forEach(s => { slotMap[s.slot_number] = s; });

        const fullSlots = Array.from({ length: 20 }, (_, i) => {
            const slotNum = i + 1;
            return slotMap[slotNum] || {
                displayId: parseInt(displayId),
                slot_number: slotNum,
                brand_id: null,
                brand_name: null,
                status: 'Available'
            };
        });

        res.json(fullSlots);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── SCREEN ASSIGNMENTS ───
router.get('/screens/assignments', async (req, res) => {
    try {
        const assignments = await dbAll(`
            SELECT sa.*, p.name as partner_name 
            FROM screen_partners sa
            LEFT JOIN partners p ON sa.partner_id = p.id
        `);
        res.json(assignments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/screens/assign-partner', async (req, res) => {
    const { displayId, partner_id } = req.body;
    if (!displayId) return res.status(400).json({ error: 'displayId is required' });
    try {
        await dbRun(
            'INSERT OR REPLACE INTO screen_partners (displayId, partner_id) VALUES (?, ?)',
            [displayId, partner_id || null]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── MEDIA BRANDS (Phase 4.1) ───
router.get('/media/brands', async (req, res) => {
    try {
        const mapping = await dbAll('SELECT * FROM media_brands');
        res.json(mapping);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/media/assign', async (req, res) => {
    const { mediaId, brand_id } = req.body;
    try {
        await dbRun(
            'INSERT OR REPLACE INTO media_brands (mediaId, brand_id) VALUES (?, ?)',
            [mediaId, brand_id]
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── REAL-TIME TEST ───
router.post('/test-sync', (req, res) => {
    const io = req.app.get('io');
    if (io) {
        io.emit('stats_updated', { source: 'Manual Admin Trigger', timestamp: Date.now() });
        res.json({ success: true, message: 'Real-time update triggered' });
    } else {
        res.status(500).json({ error: 'Socket.io not initialized' });
    }
});

module.exports = router;
