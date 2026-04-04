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

/** 
 * GET /api/admin/brands - List all registered brands with metrics.
 * Supports filters: status, industry, search (name/email).
 */
router.get('/brands', async (req, res) => {
    try {
        const { status, industry, search } = req.query;
        let query = `
            SELECT b.*,
                (SELECT COUNT(*) FROM campaigns WHERE brand_id = b.id) AS total_campaigns,
                (SELECT COUNT(DISTINCT screen_id) FROM campaigns WHERE brand_id = b.id) AS total_screens_used,
                (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE brand_id = b.id AND status = 'Paid') AS total_spend,
                (SELECT COUNT(*) FROM campaigns WHERE brand_id = b.id AND status = 'Active') AS active_campaigns
            FROM brands b
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ' AND b.status = ?';
            params.push(status);
        }
        if (industry) {
            query += ' AND b.industry = ?';
            params.push(industry);
        }
        if (search) {
            query += ' AND (b.name LIKE ? OR b.email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY b.id DESC';
        const brands = await dbAll(query, params);
        res.json(brands);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/admin/brands/:id - Full brand profile with metrics. */
router.get('/brands/:id', async (req, res) => {
    try {
        const brand = await dbGet(`
            SELECT b.*,
                (SELECT COUNT(*) FROM campaigns WHERE brand_id = b.id) AS total_campaigns,
                (SELECT COUNT(DISTINCT screen_id) FROM campaigns WHERE brand_id = b.id) AS total_screens_used,
                (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE brand_id = b.id AND status = 'Paid') AS total_spend,
                (SELECT COUNT(*) FROM campaigns WHERE brand_id = b.id AND status = 'Active') AS active_campaigns
            FROM brands b
            WHERE b.id = ?
        `, [req.params.id]);

        if (!brand) return res.status(404).json({ error: 'Brand not found' });
        res.json(brand);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/brands - Create a brand with email validation and conflict check. */
router.post('/brands', async (req, res) => {
    const { company_name, name, industry, contact_person, email, phone } = req.body;
    const finalName = company_name || name;
    
    if (!finalName || !email) {
        return res.status(400).json({ error: 'Brand name and email are required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    try {
        // Conflict check
        const existing = await dbGet('SELECT id FROM brands WHERE email = ?', [email]);
        if (existing) return res.status(409).json({ error: 'Email already exists' });

        const result = await dbRun(
            `INSERT INTO brands (name, industry, contact_person, email, phone, status) VALUES (?, ?, ?, ?, ?, 'Pending')`,
            [finalName, industry, contact_person, email, phone]
        );
        
        // Preserve user account creation (from legacy logic)
        const bcrypt = require('bcryptjs');
        const hash = bcrypt.hashSync('Brand@123', 10);
        await dbRun(
            `INSERT INTO users (username, password_hash, role, brand_id, force_password_reset) VALUES (?, ?, 'Brand', ?, 1)`,
            [email, hash, result.id]
        ).catch(e => console.error('Failed to create user for brand:', e.message));

        res.status(201).json({ success: true, brand_id: result.id });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/admin/brands/:id/approve - Activate a brand. */
router.patch('/brands/:id/approve', async (req, res) => {
    try {
        const result = await dbRun('UPDATE brands SET status = "Active" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Brand not found' });
        res.json({ success: true, brand_id: req.params.id, status: 'Active' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/admin/brands/:id/disable - Disable a brand. */
router.patch('/brands/:id/disable', async (req, res) => {
    try {
        const result = await dbRun('UPDATE brands SET status = "Disabled" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Brand not found' });
        res.json({ success: true, brand_id: req.params.id, status: 'Disabled' });
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

// ─── SUBSCRIPTIONS ───

/** GET /api/admin/subscriptions - List all subscriptions with brand name. */
router.get('/subscriptions', async (req, res) => {
    try {
        const { brand_id, status } = req.query;
        let query = `SELECT sub.*, b.name as brand_name FROM subscriptions sub LEFT JOIN brands b ON sub.brand_id = b.id`;
        const params = [];
        const wheres = [];
        if (brand_id) { wheres.push('sub.brand_id = ?'); params.push(brand_id); }
        if (status) { wheres.push('sub.status = ?'); params.push(status); }
        if (wheres.length) query += ' WHERE ' + wheres.join(' AND ');
        query += ' ORDER BY sub.id DESC';
        res.json(await dbAll(query, params));
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/admin/subscriptions/brand/:brandId - Subscriptions for a specific brand. */
router.get('/subscriptions/brand/:brandId', async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT sub.*, b.name as brand_name FROM subscriptions sub LEFT JOIN brands b ON sub.brand_id = b.id WHERE sub.brand_id = ? ORDER BY sub.id DESC`,
            [req.params.brandId]
        );
        res.json(rows);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/subscriptions - Create a new subscription. */
router.post('/subscriptions', async (req, res) => {
    const { brand_id, plan_name, start_date, end_date, screens_included, slots_included, cities, payment_status, status, notes } = req.body;
    if (!brand_id || !plan_name || !start_date || !end_date) {
        return res.status(400).json({ error: 'brand_id, plan_name, start_date, and end_date are required.' });
    }
    try {
        const result = await dbRun(
            `INSERT INTO subscriptions (brand_id, plan_name, start_date, end_date, screens_included, slots_included, cities, payment_status, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [brand_id, plan_name, start_date, end_date, screens_included || 1, slots_included || 1, cities || null, payment_status || 'Pending', status || 'Draft', notes || null]
        );
        res.status(201).json({ success: true, id: result.id });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PUT /api/admin/subscriptions/:id - Update subscription. */
router.put('/subscriptions/:id', async (req, res) => {
    const { plan_name, start_date, end_date, screens_included, slots_included, cities, payment_status, status, notes } = req.body;
    try {
        const result = await dbRun(
            `UPDATE subscriptions SET plan_name=?, start_date=?, end_date=?, screens_included=?, slots_included=?, cities=?, payment_status=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [plan_name, start_date, end_date, screens_included, slots_included, cities, payment_status, status, notes, req.params.id]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Subscription not found' });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/subscriptions/:id - Delete a subscription. */
router.delete('/subscriptions/:id', async (req, res) => {
    try {
        const result = await dbRun('DELETE FROM subscriptions WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Subscription not found' });
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

/** GET /api/admin/partners - List all screen partners with screen counts and basic info. */
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

/** GET /api/admin/partners/:id - Detailed partner profile with financial metrics. */
router.get('/partners/:id', async (req, res) => {
    try {
        const partner = await dbGet(`
            SELECT p.*,
                (SELECT COUNT(*) FROM screens WHERE partner_id = p.id) AS screen_count,
                (SELECT COALESCE(SUM(amount), 0) FROM partner_payouts WHERE partner_id = p.id AND status = 'Paid') AS total_paid,
                (SELECT COALESCE(SUM(amount), 0) FROM partner_payouts WHERE partner_id = p.id AND status = 'Pending') AS pending_balance
            FROM partners p
            WHERE p.id = ?
        `, [req.params.id]);

        if (!partner) return res.status(404).json({ error: 'Partner not found' });
        res.json(partner);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/partners - Register a new screen partner with validation and conflict check. */
router.post('/partners', async (req, res) => {
    const { name, company, email, phone, address } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({ error: 'Partner name and email are required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    try {
        // Conflict check
        const existing = await dbGet('SELECT id FROM partners WHERE email = ?', [email]);
        if (existing) return res.status(409).json({ error: 'Email already exists' });

        const result = await dbRun(
            `INSERT INTO partners (name, company, email, phone, address, status, revenue_share_percentage) 
             VALUES (?, ?, ?, ?, ?, 'Pending', 50)`,
            [name, company, email, phone, address]
        );

        // Preserve user account creation (from legacy logic)
        const bcrypt = require('bcryptjs');
        const hash = bcrypt.hashSync('Partner@123', 10);
        await dbRun(
            `INSERT INTO users (username, password_hash, role, partner_id) VALUES (?, ?, 'Partner', ?)`,
            [email, hash, result.id]
        ).catch(e => console.error('Failed to create user for partner:', e.message));

        res.status(201).json({ success: true, partner_id: result.id });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/admin/partners/:id/approve - Activate a partner. */
router.patch('/partners/:id/approve', async (req, res) => {
    try {
        const result = await dbRun('UPDATE partners SET status = "Active" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Partner not found' });
        res.json({ success: true, partner_id: req.params.id, status: 'Active' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/admin/partners/:id/disable - Disable a partner. */
router.patch('/partners/:id/disable', async (req, res) => {
    try {
        const result = await dbRun('UPDATE partners SET status = "Disabled" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Partner not found' });
        res.json({ success: true, partner_id: req.params.id, status: 'Disabled' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/admin/partners/payouts/pending - List all pending payout requests for review. */
router.get('/partners/payouts/pending', async (req, res) => {
    try {
        const pending = await dbAll(`
            SELECT pp.*, p.name as partner_name, p.company
            FROM partner_payouts pp
            JOIN partners p ON pp.partner_id = p.id
            WHERE pp.status = 'Pending'
            ORDER BY pp.created_at ASC
        `);
        res.json(pending);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/partners/payouts/:id/approve - Approve a payout request. */
router.post('/partners/payouts/:id/approve', async (req, res) => {
    try {
        const result = await dbRun('UPDATE partner_payouts SET status = "Paid" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Payout request not found' });
        res.json({ success: true, payout_id: req.params.id, status: 'Paid' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PUT /api/admin/partners/:id - Update partner profile. */
router.put('/partners/:id', async (req, res) => {
    const { name, company, email, phone, address, status, revenue_share_percentage } = req.body;
    try {
        await dbRun(
            `UPDATE partners SET name=?, company=?, email=?, phone=?, address=?, status=?, revenue_share_percentage=? WHERE id=?`,
            [name, company, email, phone, address, status, revenue_share_percentage, req.params.id]
        );
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/partners/:id - Delete partner and unassign their screens. */
router.delete('/partners/:id', async (req, res) => {
    const partnerId = req.params.id;
    try {
        await dbRun('UPDATE screens SET partner_id = NULL WHERE partner_id = ?', [partnerId]);
        await dbRun('UPDATE users SET partner_id = NULL WHERE partner_id = ?', [partnerId]);
        await dbRun(`DELETE FROM partners WHERE id = ?`, [partnerId]);
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
    let { name, city, address, latitude, longitude, timezone, partner_id, notes, xibo_display_id, status, is_fixed_location, location_source } = req.body;
    
    // Sanitize coordinates to handle empty strings or UI nulls
    if (latitude === '' || latitude === undefined) latitude = null;
    if (longitude === '' || longitude === undefined) longitude = null;
    if (latitude !== null) latitude = parseFloat(latitude);
    if (longitude !== null) longitude = parseFloat(longitude);

    // Sanitize boolean fields
    const fixedLocation = (is_fixed_location !== undefined) ? (is_fixed_location ? 1 : 0) : null;

    try {
        let query, params;
        if (fixedLocation !== null || location_source) {
            query = `UPDATE screens SET name=?, city=?, address=?, latitude=?, longitude=?, timezone=?, partner_id=?, notes=?, xibo_display_id=?, status=?, is_fixed_location=COALESCE(?,is_fixed_location), location_source=COALESCE(?,location_source), updated_at=CURRENT_TIMESTAMP WHERE id=?`;
            params = [name, city, address, latitude, longitude, timezone, partner_id, notes, xibo_display_id, status, fixedLocation, location_source || null, req.params.id];
        } else {
            query = `UPDATE screens SET name=?, city=?, address=?, latitude=?, longitude=?, timezone=?, partner_id=?, notes=?, xibo_display_id=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`;
            params = [name, city, address, latitude, longitude, timezone, partner_id, notes, xibo_display_id, status, req.params.id];
        }
        await dbRun(query, params);
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

/** POST /api/admin/slots/assign - Allocate a specific slot to a brand (with subscription validation). */
router.post('/slots/assign', async (req, res) => {
    const { displayId, slot_number, brand_id, start_date, end_date, creative_name, subscription_id } = req.body;

    // --- Subscription Validation (only when assigning to a brand) ---
    if (brand_id) {
        // 1. Active subscription gate
        const today = new Date().toISOString().slice(0, 10);
        const sub = subscription_id
            ? await dbGet('SELECT * FROM subscriptions WHERE id = ? AND brand_id = ?', [subscription_id, brand_id])
            : await dbGet(
                `SELECT * FROM subscriptions WHERE brand_id = ? AND status = 'Active' AND start_date <= ? AND end_date >= ? ORDER BY id DESC LIMIT 1`,
                [brand_id, today, today]
              );

        if (!sub) {
            return res.status(403).json({ error: 'Brand does not have an active subscription. Activate a subscription before assigning slots.' });
        }

        // 2. Screen scope check — only count if this is a brand-new screen for this brand
        const usedScreensRow = await dbGet('SELECT COUNT(DISTINCT displayId) as cnt FROM slots WHERE brand_id = ? AND status = ?', [brand_id, 'Active']);
        const currentScreenCount = usedScreensRow ? usedScreensRow.cnt : 0;
        const alreadyOnThisScreen = await dbGet('SELECT id FROM slots WHERE brand_id = ? AND displayId = ? AND status = ? LIMIT 1', [brand_id, displayId, 'Active']);
        // Only counts as a new screen if the brand hasn't already occupied this screen
        if (!alreadyOnThisScreen && (currentScreenCount + 1) > sub.screens_included) {
            return res.status(403).json({ error: `Screen limit reached. Subscription allows ${sub.screens_included} screen(s). Currently using ${currentScreenCount}.` });
        }

        // 3. Slot scope check
        const usedSlotsRow = await dbGet('SELECT COUNT(*) as cnt FROM slots WHERE brand_id = ? AND NOT (displayId = ? AND slot_number = ?)', [brand_id, displayId, slot_number]);
        const usedSlots = usedSlotsRow ? usedSlotsRow.cnt : 0;
        if (usedSlots + 1 > sub.slots_included) {
            return res.status(403).json({ error: `Slot limit reached. Subscription allows ${sub.slots_included} slot(s). Currently using ${usedSlots}.` });
        }

        // 4. Double-booking check (same slot, overlapping date range)
        const existing = await dbGet(
            'SELECT brand_id FROM slots WHERE displayId = ? AND slot_number = ? AND brand_id IS NOT NULL AND brand_id != ?',
            [displayId, slot_number, brand_id]
        );
        if (existing) {
            return res.status(409).json({ error: `Slot ${slot_number} on display ${displayId} is already assigned to another brand.` });
        }
    }

    try {
        const slotData = await dbGet('SELECT * FROM slots WHERE displayId = ? AND slot_number = ?', [displayId, slot_number]);
        const newStatus = brand_id ? 'Active' : 'Available';
        const subId = subscription_id || null;

        if (slotData) {
            await dbRun(
                `UPDATE slots SET brand_id = ?, status = ?, subscription_id = ?, start_date = ?, end_date = ?, creative_name = ?, updated_at = CURRENT_TIMESTAMP WHERE displayId = ? AND slot_number = ?`,
                [brand_id || null, newStatus, subId, start_date || null, end_date || null, creative_name || null, displayId, slot_number]
            );
        } else {
            await dbRun(
                'INSERT INTO slots (displayId, slot_number, brand_id, status, subscription_id, start_date, end_date, creative_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [displayId, slot_number, brand_id || null, newStatus, subId, start_date || null, end_date || null, creative_name || null]
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

// ─── PARTNER PAYOUTS ──────────────────────────────────────────────────────────

/** GET /api/admin/payouts - Fetch all partner payout requests (pending and processed). */
router.get('/payouts', async (req, res) => {
    try {
        const payouts = await dbAll(`
            SELECT pp.*, p.name as partner_name, p.company as partner_company
            FROM partner_payouts pp
            JOIN partners p ON pp.partner_id = p.id
            ORDER BY pp.created_at DESC
        `);
        res.json(payouts);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── BILLING & INVOICING ──────────────────────────────────────────────────────

/** GET /api/admin/billing/summary - Aggregated stats for the current month. */
router.get('/billing/summary', async (req, res) => {
    try {
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const stats = await dbGet(`
            SELECT 
                SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END) as totalPaid,
                SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END) as totalPending,
                COUNT(*) as totalInvoices
            FROM invoices 
            WHERE DATE_FORMAT(created_at, '%Y-%m') = ?
        `, [currentMonth]);
        
        res.json(stats || { totalPaid: 0, totalPending: 0, totalInvoices: 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/billing/generate-monthly - Bulk create invoices for active brands. */
router.post('/billing/generate-monthly', async (req, res) => {
    try {
        const now = new Date();
        const monthStr = now.toISOString().slice(0, 7).replace('-', ''); // YYYYMM
        const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10); // End of month

        // 1. Find all active brands with a monthly_rate > 0
        const brands = await dbAll('SELECT id, name, monthly_rate FROM brands WHERE status = "Active" AND monthly_rate > 0');
        
        const results = [];
        for (const brand of brands) {
            const invoiceNum = `INV-B${brand.id}-${monthStr}`;
            
            // 2. Check if already exists for this month to prevent duplicates
            const existing = await dbGet('SELECT id FROM invoices WHERE invoice_number = ?', [invoiceNum]);
            if (existing) {
                results.push({ brand: brand.name, status: 'Skipped', reason: 'Invoice already exists' });
                continue;
            }

            // 3. Create the invoice
            await dbRun(
                'INSERT INTO invoices (invoice_number, brand_id, amount, status, due_date) VALUES (?, ?, ?, "Pending", ?)',
                [invoiceNum, brand.id, brand.monthly_rate, dueDate]
            );
            results.push({ brand: brand.name, status: 'Created', amount: brand.monthly_rate });
        }

        res.json({ success: true, processed: results.length, details: results });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/admin/reports/financials - Consolidated Financial Health analytics. */
router.get('/reports/financials', async (req, res) => {
    try {
        const [revenue, payables, monthlyBreakdown] = await Promise.all([
            // 1. Revenue from Brands
            dbGet(`
                SELECT 
                    SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END) as collected,
                    SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END) as outstanding,
                    SUM(amount) as total
                FROM invoices
            `),
            // 2. Payables to Partners
            dbGet(`
                SELECT 
                    SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END) as paidOut,
                    SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END) as pendingPayouts,
                    SUM(amount) as totalPayables
                FROM partner_payouts
            `),
            // 3. Monthly Breakdown (Join by Month)
            dbAll(`
                SELECT 
                    COALESCE(i.month, p.month) as month,
                    COALESCE(i.revenue, 0) as revenue,
                    COALESCE(p.payouts, 0) as payouts,
                    (COALESCE(i.revenue, 0) - COALESCE(p.payouts, 0)) as margin
                FROM (
                    SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(amount) as revenue 
                    FROM invoices GROUP BY month
                ) i
                LEFT JOIN (
                    SELECT month, SUM(amount) as payouts 
                    FROM partner_payouts GROUP BY month
                ) p ON i.month = p.month
                UNION
                SELECT 
                    COALESCE(i.month, p.month) as month,
                    COALESCE(i.revenue, 0) as revenue,
                    COALESCE(p.payouts, 0) as payouts,
                    (COALESCE(i.revenue, 0) - COALESCE(p.payouts, 0)) as margin
                FROM (
                    SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(amount) as revenue 
                    FROM invoices GROUP BY month
                ) i
                RIGHT JOIN (
                    SELECT month, SUM(amount) as payouts 
                    FROM partner_payouts GROUP BY month
                ) p ON i.month = p.month
                ORDER BY month DESC
            `)
        ]);

        res.json({
            revenue: {
                total: revenue.total || 0,
                collected: revenue.collected || 0,
                outstanding: revenue.outstanding || 0
            },
            payables: {
                total: payables.totalPayables || 0,
                paid: payables.paidOut || 0,
                pending: payables.pendingPayouts || 0
            },
            netMargin: (revenue.total || 0) - (payables.totalPayables || 0),
            realizedProfit: (revenue.collected || 0) - (payables.paidOut || 0),
            history: monthlyBreakdown
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


/** PATCH /api/admin/payouts/:id/approve - Mark a payout request as Paid. */
router.patch('/payouts/:id/approve', async (req, res) => {

    try {
        const { id } = req.params;
        const result = await dbRun(
            'UPDATE partner_payouts SET status = "Paid", created_at = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
        );
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Payout request not found.' });
        }
        res.json({ success: true, message: 'Payout marked as Paid.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/admin/network/health - Detailed network status of all displays. */
router.get('/network/health', async (req, res) => {
    try {
        const displays = await xiboService.getDisplays();
        const healthStats = displays.map(d => xiboService.getDisplayHealth(d));
        
        const summary = {
            total: healthStats.length,
            online: healthStats.filter(h => h.status === 'Online').length,
            offline: healthStats.filter(h => h.status === 'Offline').length,
            stale: healthStats.filter(h => h.status === 'Stale').length,
            criticalStorage: healthStats.filter(h => h.storage.status === 'Critical').length
        };

        res.json({ success: true, summary, displays: healthStats });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/admin/creatives/pending - List all media uploaded by brands awaiting review. */
router.get('/creatives/pending', async (req, res) => {
    try {
        const query = `
            SELECT mb.mediaId, mb.brand_id, mb.status, b.name as brand_name, mb.moderated_at
            FROM media_brands mb
            JOIN brands b ON mb.brand_id = b.id
            WHERE mb.status = 'Pending'
            ORDER BY mb.mediaId DESC
        `;
        const pending = await dbAll(query);
        
        // Fetch library details from Xibo for thumbnails/names
        const xiboLibrary = await xiboService.getLibrary({ length: 100 });
        const enriched = pending.map(p => {
            const x = xiboLibrary.find(m => m.mediaId === p.mediaId);
            return {
                ...p,
                name: x ? x.name : 'Unknown Media',
                fileName: x ? x.fileName : '',
                mediaType: x ? x.mediaType : 'video'
            };
        });
        
        res.json(enriched);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/admin/creatives/:id/approve - Approve an uploaded creative. */
router.patch('/creatives/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await dbRun(
            'UPDATE media_brands SET status = "Approved", moderated_at = CURRENT_TIMESTAMP WHERE mediaId = ?',
            [id]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Creative record not found.' });
        res.json({ success: true, message: 'Creative approved successfully.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/admin/creatives/:id/reject - Reject an uploaded creative. */
router.patch('/creatives/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await dbRun(
            'UPDATE media_brands SET status = "Rejected", moderated_at = CURRENT_TIMESTAMP WHERE mediaId = ?',
            [id]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Creative record not found.' });
        res.json({ success: true, message: 'Creative rejected.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;


