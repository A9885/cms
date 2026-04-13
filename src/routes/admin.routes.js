const express = require('express');
const router = express.Router();
const { dbRun, dbAll, dbGet } = require('../db/database');
const xiboService = require('../services/xibo.service');
const statsService = require('../services/stats.service');
const { logActivity, ACTION, MODULE } = require('../services/activity-logger.service');

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
            xiboService.getDisplays().catch(e => {
                console.warn('[Admin API] Xibo Displays unreachable:', e.message);
                return [];
            }),
            xiboService.getCampaigns().catch(e => {
                console.warn('[Admin API] Xibo Campaigns unreachable:', e.message);
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
    const { company_name, name, industry, contact_person, email, phone, password } = req.body;
    const finalName = company_name || name;
    
    if (!finalName || !email) {
        return res.status(400).json({ error: 'Brand name and email are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    try {
        const existing = await dbGet('SELECT id FROM brands WHERE email = ?', [email]);
        if (existing) return res.status(409).json({ error: 'Email already exists' });

        const result = await dbRun(
            `INSERT INTO brands (name, industry, contact_person, email, phone, status) VALUES (?, ?, ?, ?, ?, 'Active')`,
            [finalName, industry, contact_person, email, phone]
        );
        
        const { hashPassword } = await import('@better-auth/utils/password');
        const hash = await hashPassword(password || 'Brand@123');
        
        // 1. Create or update user
        await dbRun(
            `INSERT INTO users (username, email, password_hash, role, brand_id, force_password_reset) 
             VALUES (?, ?, ?, 'Brand', ?, 1)
             ON DUPLICATE KEY UPDATE brand_id = VALUES(brand_id), role = VALUES(role), password_hash = VALUES(password_hash)`,
            [email, email, hash, result.id]
        );

        // 2. Get the actual userId (since insertId might be 0 on update)
        const user = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
        const userId = user ? user.id : null;

        // 3. Ensure Better Auth account exists and is synced
        if (userId) {
            await dbRun(
                `INSERT INTO account (id, userId, providerId, accountId, password) 
                 VALUES (?, ?, 'credential', ?, ?)
                 ON DUPLICATE KEY UPDATE password = VALUES(password)`,
                [`acc_${userId}`, userId, email, hash]
            );
        }

        logActivity({ action: ACTION.CREATE, module: MODULE.BRAND, description: `Brand "${finalName}" created (ID: ${result.id})`, req });
        res.status(201).json({ success: true, brand_id: result.id });
    } catch(err) {
        logActivity({ action: ACTION.ERROR, module: MODULE.BRAND, description: `Failed to create brand "${finalName}": ${err.message}`, req });
        res.status(500).json({ error: err.message });
    }
});

/** PATCH /api/admin/brands/:id/approve - Activate a brand. */
router.patch('/brands/:id/approve', async (req, res) => {
    try {
        const result = await dbRun('UPDATE brands SET status = "Active" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Brand not found' });
        logActivity({ action: ACTION.APPROVE, module: MODULE.BRAND, description: `Brand ID ${req.params.id} approved/activated`, req });
        res.json({ success: true, brand_id: req.params.id, status: 'Active' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/admin/brands/:id/disable - Disable a brand. */
router.patch('/brands/:id/disable', async (req, res) => {
    try {
        const result = await dbRun('UPDATE brands SET status = "Disabled" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Brand not found' });
        logActivity({ action: ACTION.UPDATE, module: MODULE.BRAND, description: `Brand ID ${req.params.id} disabled`, req });
        res.json({ success: true, brand_id: req.params.id, status: 'Disabled' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});


/** PUT /api/admin/brands/:id - Update brand profile. */
router.put('/brands/:id', async (req, res) => {
    const { name, industry, contact_person, email, phone, status, password } = req.body;
    try {
        await dbRun(
            `UPDATE brands SET name=?, industry=?, contact_person=?, email=?, phone=?, status=? WHERE id=?`,
            [name, industry, contact_person, email, phone, status, req.params.id]
        );

        if (email) {
            const { hashPassword } = await import('@better-auth/utils/password');
            const hash = password ? await hashPassword(password) : null;
            
            // Sync user record
            const userUpdateSql = hash 
                ? `INSERT INTO users (username, email, password_hash, role, brand_id, force_password_reset) 
                   VALUES (?, ?, ?, 'Brand', ?, 1)
                   ON DUPLICATE KEY UPDATE brand_id = VALUES(brand_id), role = VALUES(role), password_hash = VALUES(password_hash)`
                : `INSERT INTO users (username, email, password_hash, role, brand_id, force_password_reset) 
                   VALUES (?, ?, '---', 'Brand', ?, 0)
                   ON DUPLICATE KEY UPDATE brand_id = VALUES(brand_id), role = VALUES(role)`;
            
            const params = hash ? [email, email, hash, req.params.id] : [email, email, req.params.id];
            await dbRun(userUpdateSql, params);

            const user = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
            const userId = user ? user.id : null;

            // Sync account if password provided
            if (hash && userId) {
                await dbRun(
                    `INSERT INTO account (id, userId, providerId, accountId, password) 
                     VALUES (?, ?, 'credential', ?, ?)
                     ON DUPLICATE KEY UPDATE password = VALUES(password)`,
                    [`acc_${userId}`, userId, email, hash]
                );
            }
        }

        logActivity({ action: ACTION.UPDATE, module: MODULE.BRAND, description: `Brand ID ${req.params.id} updated`, req });
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
        const [campaignsCount, screensCount, spendSum, brandMedia, allStats] = await Promise.all([
            dbGet('SELECT COUNT(DISTINCT id) as count FROM campaigns WHERE brand_id = ?', [brandId]),
            dbGet('SELECT COUNT(DISTINCT displayId) as count FROM slots WHERE brand_id = ?', [brandId]),
            dbGet('SELECT SUM(amount) as total FROM invoices WHERE brand_id = ?', [brandId]),
            dbAll('SELECT mediaId FROM media_brands WHERE brand_id = ?', [brandId]),
            statsService.getAllMediaStats()
        ]);
        
        const myMediaIds = new Set(brandMedia.map(bm => String(bm.mediaId)));
        const totalPlays = allStats.reduce((sum, s) => {
            if (myMediaIds.has(String(s.mediaId))) return sum + (s.totalPlays || 0);
            return sum;
        }, 0);

        res.json({
            totalCampaigns: campaignsCount.count || 0,
            totalScreens: screensCount.count || 0,
            totalSpend: spendSum.total || 0,
            totalPlays: totalPlays
        });
    } catch (err) {
        console.error('[Admin API] Brand Metrics Error:', err.message);
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

/** GET /api/admin/brands/:id/creatives - List all library creatives assigned to a brand. */
router.get('/brands/:id/creatives', async (req, res) => {
    const brandId = req.params.id;
    try {
        const mappings = await dbAll('SELECT mediaId, status FROM media_brands WHERE brand_id = ?', [brandId]);
        if (mappings.length === 0) return res.json([]);

        const library = await xiboService.getLibrary({ length: 500 });
        const mappingMap = new Map(mappings.map(m => [String(m.mediaId), m.status]));
        
        const filtered = library
          .filter(media => mappingMap.has(String(media.mediaId)))
          .map(media => ({
            ...media,
            status: mappingMap.get(String(media.mediaId)) || 'Pending'
          }));

        res.json(filtered);
    } catch (err) {
        console.error('[Admin API] Brand Creatives Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/admin/media/link-brand - Link an uploaded media artifact to a specific brand. */
router.post('/media/link-brand', async (req, res) => {
    const { mediaId, brandId, displayId, slotId } = req.body;
    if (!mediaId || !brandId) return res.status(400).json({ error: 'Media ID and Brand ID are required' });
    try {
        await dbRun('REPLACE INTO media_brands (mediaId, brand_id, status) VALUES (?, ?, "Approved")', [mediaId, brandId]);
        
        // Also permanently lock the slot to this brand for future auto-linking!
        if (displayId && slotId) {
            await dbRun(
                'INSERT INTO slots (displayId, slot_number, brand_id, status) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE brand_id = VALUES(brand_id), status = VALUES(status)',
                [displayId, slotId, brandId, 'Assigned']
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[Admin API] Link Brand Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/** GET /api/admin/media/brands - Get all media-to-brand mappings */
router.get('/media/brands', async (req, res) => {
    try {
        const mappings = await dbAll('SELECT * FROM media_brands');
        res.json(mappings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/admin/media/assign - Admin Portal forced media-to-brand mapping */
router.post('/media/assign', async (req, res) => {
    const { mediaId, brand_id } = req.body;
    if (!mediaId) return res.status(400).json({ error: 'Media ID is required' });
    try {
        if (!brand_id) {
            await dbRun('DELETE FROM media_brands WHERE mediaId = ?', [mediaId]);
        } else {
            await dbRun('REPLACE INTO media_brands (mediaId, brand_id, status) VALUES (?, ?, "Approved")', [mediaId, brand_id]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[Admin API] Media Assign Error:', err.message);
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
    const { name, company, email, phone, address, city, password } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({ error: 'Partner name and email are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    try {
        const existing = await dbGet('SELECT id FROM partners WHERE email = ?', [email]);
        if (existing) return res.status(409).json({ error: 'Email already exists' });

        const result = await dbRun(
            `INSERT INTO partners (name, company, email, phone, address, city, status, revenue_share_percentage) 
             VALUES (?, ?, ?, ?, ?, ?, 'Active', 50)`,
            [name, company, email, phone, address, city]
        );

        const { hashPassword } = await import('@better-auth/utils/password');
        const hash = await hashPassword(password || 'Partner@123');
        
        // 1. Create or update user
        await dbRun(
            `INSERT INTO users (username, email, password_hash, role, partner_id, force_password_reset) 
             VALUES (?, ?, ?, 'Partner', ?, 1)
             ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id), role = VALUES(role), password_hash = VALUES(password_hash)`,
            [email, email, hash, result.id]
        );

        // 2. Get the actual userId
        const user = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
        const userId = user ? user.id : null;

        // 3. Ensure Better Auth account exists and is synced
        if (userId) {
            await dbRun(
                `INSERT INTO account (id, userId, providerId, accountId, password) 
                 VALUES (?, ?, 'credential', ?, ?)
                 ON DUPLICATE KEY UPDATE password = VALUES(password)`,
                [`acc_${userId}`, userId, email, hash]
            );
        }

        logActivity({ action: ACTION.CREATE, module: MODULE.PARTNER, description: `Partner "${name}" created (ID: ${result.id})`, req });
        res.status(201).json({ success: true, partner_id: result.id });
    } catch(err) {
        logActivity({ action: ACTION.ERROR, module: MODULE.PARTNER, description: `Failed to create partner "${name}": ${err.message}`, req });
        res.status(500).json({ error: err.message });
    }
});

/** PATCH /api/admin/partners/:id/approve - Activate a partner. */
router.patch('/partners/:id/approve', async (req, res) => {
    try {
        const result = await dbRun('UPDATE partners SET status = "Active" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Partner not found' });
        logActivity({ action: ACTION.APPROVE, module: MODULE.PARTNER, description: `Partner ID ${req.params.id} approved/activated`, req });
        res.json({ success: true, partner_id: req.params.id, status: 'Active' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/admin/partners/:id/disable - Disable a partner. */
router.patch('/partners/:id/disable', async (req, res) => {
    try {
        const result = await dbRun('UPDATE partners SET status = "Disabled" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Partner not found' });
        logActivity({ action: ACTION.UPDATE, module: MODULE.PARTNER, description: `Partner ID ${req.params.id} disabled`, req });
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
    const { name, company, email, phone, address, city, status, revenue_share_percentage, password } = req.body;
    try {
        await dbRun(
            `UPDATE partners SET name=?, company=?, email=?, phone=?, address=?, city=?, status=?, revenue_share_percentage=? WHERE id=?`,
            [name, company, email, phone, address, city, status, revenue_share_percentage, req.params.id]
        );

        if (email) {
            const { hashPassword } = await import('@better-auth/utils/password');
            const hash = password ? await hashPassword(password) : null;
            
            // Sync user record
            const userUpdateSql = hash 
                ? `INSERT INTO users (username, email, password_hash, role, partner_id, force_password_reset) 
                   VALUES (?, ?, ?, 'Partner', ?, 1)
                   ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id), role = VALUES(role), password_hash = VALUES(password_hash)`
                : `INSERT INTO users (username, email, password_hash, role, partner_id, force_password_reset) 
                   VALUES (?, ?, '---', 'Partner', ?, 0)
                   ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id), role = VALUES(role)`;
            
            const params = hash ? [email, email, hash, req.params.id] : [email, email, req.params.id];
            await dbRun(userUpdateSql, params);

            const user = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
            const userId = user ? user.id : null;

            // Sync account if password provided
            if (hash && userId) {
                await dbRun(
                    `INSERT INTO account (id, userId, providerId, accountId, password) 
                     VALUES (?, ?, 'credential', ?, ?)
                     ON DUPLICATE KEY UPDATE password = VALUES(password)`,
                    [`acc_${userId}`, userId, email, hash]
                );
            }
        }

        logActivity({ action: ACTION.UPDATE, module: MODULE.PARTNER, description: `Partner ID ${req.params.id} updated`, req });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/partners/:id - Delete partner and unassign their screens. */
router.delete('/partners/:id', async (req, res) => {
    const partnerId = req.params.id;
    try {
        const partner = await dbGet('SELECT name FROM partners WHERE id = ?', [partnerId]);
        await dbRun('UPDATE screens SET partner_id = NULL WHERE partner_id = ?', [partnerId]);
        await dbRun('UPDATE users SET partner_id = NULL WHERE partner_id = ?', [partnerId]);
        await dbRun(`DELETE FROM partners WHERE id = ?`, [partnerId]);
        logActivity({ action: ACTION.DELETE, module: MODULE.PARTNER, description: `Partner "${partner?.name || partnerId}" (ID: ${partnerId}) deleted`, req });
        res.json({ success: true });
    } catch(err) {
        logActivity({ action: ACTION.ERROR, module: MODULE.PARTNER, description: `Failed to delete partner ID ${partnerId}: ${err.message}`, req });
        res.status(500).json({ error: err.message });
    }
});


/** POST /api/admin/partners/:id/assign-screens - Bulk assign screens to a partner. */
router.post('/partners/:id/assign-screens', async (req, res) => {
    const partnerId = req.params.id;
    const { screenIds } = req.body; // Array of local screen IDs
    if (!Array.isArray(screenIds)) return res.status(400).json({ error: 'screenIds must be an array' });
    
    try {
        const screenService = require('../services/screen.service');

        // Fetch screens that are currently assigned to this partner (to detect removals)
        const previousScreens = await dbAll(
            'SELECT id, xibo_display_id FROM screens WHERE partner_id = ?', 
            [partnerId]
        );

        // Unassign all screens currently belonging to this partner
        await dbRun('UPDATE screens SET partner_id = NULL WHERE partner_id = ?', [partnerId]);

        // Assign the new selection
        if (screenIds.length > 0) {
            const ph = screenIds.map(() => '?').join(',');
            await dbRun(`UPDATE screens SET partner_id = ? WHERE id IN (${ph})`, [partnerId, ...screenIds]);
        }

        res.json({ success: true });

        // ─── Xibo Display Group Sync (background, non-blocking) ─────────────────
        setImmediate(async () => {
            try {
                // Screens removed from this partner
                const newIdSet = new Set(screenIds.map(String));
                const removed = previousScreens.filter(s => !newIdSet.has(String(s.id)) && s.xibo_display_id);
                for (const s of removed) {
                    await screenService.onScreenRemovedFromPartner(s.xibo_display_id, partnerId);
                }

                // Screens newly assigned to this partner
                if (screenIds.length > 0) {
                    const ph = screenIds.map(() => '?').join(',');
                    const newScreens = await dbAll(
                        `SELECT id, xibo_display_id FROM screens WHERE id IN (${ph}) AND xibo_display_id IS NOT NULL`,
                        screenIds
                    );
                    for (const s of newScreens) {
                        await screenService.onScreenAssignedToPartner(s.xibo_display_id, partnerId);
                    }
                }
            } catch (syncErr) {
                console.warn('[Admin API] Xibo group sync (background) error:', syncErr.message);
            }
        });

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
        logActivity({ action: ACTION.CREATE, module: MODULE.SCREEN, description: `Screen "${name}" added (ID: ${result.id})`, req });
        res.json({ success: true, id: result.id });
    } catch(err) {
        logActivity({ action: ACTION.ERROR, module: MODULE.SCREEN, description: `Failed to add screen "${name}": ${err.message}`, req });
        res.status(500).json({ error: err.message });
    }
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
        logActivity({ action: ACTION.UPDATE, module: MODULE.SCREEN, description: `Screen ID ${req.params.id} updated`, req });
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
        const screen = await dbGet('SELECT name, xibo_display_id FROM screens WHERE id = ?', [req.params.id]);
        if (screen && screen.xibo_display_id) {
            await dbRun('DELETE FROM slots WHERE displayId = ?', [screen.xibo_display_id]);
            await dbRun('DELETE FROM screen_partners WHERE displayId = ?', [screen.xibo_display_id]);
        }
        await dbRun(`DELETE FROM screens WHERE id = ?`, [req.params.id]);
        logActivity({ action: ACTION.DELETE, module: MODULE.SCREEN, description: `Screen "${screen?.name || req.params.id}" (ID: ${req.params.id}) deleted`, req });
        res.json({ success: true });
    } catch(err) {
        logActivity({ action: ACTION.ERROR, module: MODULE.SCREEN, description: `Failed to delete screen ID ${req.params.id}: ${err.message}`, req });
        res.status(500).json({ error: err.message });
    }
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
    const { displayId, slot_number, brand_id, start_date, end_date, creative_name, subscription_id, mediaId } = req.body;

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
        const mId = mediaId || (slotData ? slotData.mediaId : null);

        if (slotData) {
            await dbRun(
                `UPDATE slots SET brand_id = ?, status = ?, subscription_id = ?, start_date = ?, end_date = ?, creative_name = ?, mediaId = ?, updated_at = CURRENT_TIMESTAMP WHERE displayId = ? AND slot_number = ?`,
                [brand_id || null, newStatus, subId, start_date || null, end_date || null, creative_name || null, mId, displayId, slot_number]
            );
        } else {
            await dbRun(
                'INSERT INTO slots (displayId, slot_number, brand_id, status, subscription_id, start_date, end_date, creative_name, mediaId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [displayId, slot_number, brand_id || null, newStatus, subId, start_date || null, end_date || null, creative_name || null, mId]
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


// ─── XIBO AUTO-PROVISIONING (SAAS) ───────────────────────────────────────────

const provisioningService = require('../services/xibo-provisioning.service');

/**
 * POST /admin/api/partners/:id/xibo/connect
 * Save Xibo credentials for a partner and trigger auto-provisioning.
 * Body: { xibo_base_url, client_id, client_secret }
 */
router.post('/partners/:id/xibo/connect', async (req, res) => {
    const partnerId = parseInt(req.params.id, 10);
    const { xibo_base_url, client_id, client_secret } = req.body;

    if (!xibo_base_url || !client_id || !client_secret) {
        return res.status(400).json({ error: 'xibo_base_url, client_id, and client_secret are required.' });
    }

    const partner = await dbGet('SELECT id, name FROM partners WHERE id = ?', [partnerId]);
    if (!partner) return res.status(404).json({ error: 'Partner not found' });

    try {
        // Save credentials (upsert)
        await dbRun(`
            INSERT INTO partner_xibo_credentials 
                (partner_id, xibo_base_url, client_id, client_secret, provision_status)
            VALUES (?, ?, ?, ?, 'pending')
            ON DUPLICATE KEY UPDATE
                xibo_base_url = VALUES(xibo_base_url),
                client_id = VALUES(client_id),
                client_secret = VALUES(client_secret),
                provision_status = 'pending',
                provision_error = NULL,
                provision_log = NULL,
                updated_at = CURRENT_TIMESTAMP
        `, [partnerId, xibo_base_url.trim().replace(/\/$/, ''), client_id.trim(), client_secret.trim()]);

        // Trigger provisioning asynchronously (fire & forget for fast API response)
        res.json({ success: true, message: 'Credentials saved. Provisioning started.', status: 'provisioning' });

        // Run in background
        provisioningService.provisionPartner(partnerId).catch(err => {
            console.error(`[Admin API] Background provisioning failed for partner ${partnerId}:`, err.message);
        });

    } catch (err) {
        console.error('[Admin API] Xibo connect error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /admin/api/partners/:id/xibo/status
 * Poll the provisioning status + step log for a partner.
 */
router.get('/partners/:id/xibo/status', async (req, res) => {
    const partnerId = parseInt(req.params.id, 10);
    try {
        const cred = await dbGet(
            'SELECT provision_status, provision_error, provision_log, xibo_base_url, updated_at FROM partner_xibo_credentials WHERE partner_id = ?',
            [partnerId]
        );

        if (!cred) {
            return res.json({ connected: false, status: 'not_configured' });
        }

        let steps = [];
        try { steps = JSON.parse(cred.provision_log || '{}')?.steps || []; } catch(e) {}

        res.json({
            connected: true,
            status: cred.provision_status,
            error: cred.provision_error || null,
            xibo_base_url: cred.xibo_base_url,
            steps,
            updatedAt: cred.updated_at
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /admin/api/partners/:id/xibo/reprovision
 * Body: { reset: true } → clears all resources and re-provisions from scratch.
 *       { reset: false } → idempotent re-run (only creates missing resources).
 */
router.post('/partners/:id/xibo/reprovision', async (req, res) => {
    const partnerId = parseInt(req.params.id, 10);
    const { reset = false } = req.body;

    const cred = await dbGet('SELECT id FROM partner_xibo_credentials WHERE partner_id = ?', [partnerId]);
    if (!cred) return res.status(404).json({ error: 'No Xibo credentials found. Connect first.' });

    res.json({ success: true, message: reset ? 'Full reset provisioning started.' : 'Idempotent re-provision started.' });

    // Background
    const job = reset
        ? provisioningService.resetAndReprovision(partnerId)
        : provisioningService.reprovisionPartner(partnerId);

    job.catch(err => console.error(`[Admin API] Reprovision failed for partner ${partnerId}:`, err.message));
});

/**
 * DELETE /admin/api/partners/:id/xibo/disconnect
 * Remove Xibo credentials and all provisioned resource records.
 */
router.delete('/partners/:id/xibo/disconnect', async (req, res) => {
    const partnerId = parseInt(req.params.id, 10);
    try {
        await dbRun('DELETE FROM partner_xibo_resources WHERE partner_id = ?', [partnerId]);
        await dbRun('DELETE FROM partner_xibo_credentials WHERE partner_id = ?', [partnerId]);
        await dbRun(`
            UPDATE partners 
            SET xibo_provision_status = 'not_started', xibo_folder_id = NULL, xibo_display_group_id = NULL
            WHERE id = ?
        `, [partnerId]);
        res.json({ success: true, message: 'Xibo integration disconnected.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /admin/api/partners/:id/xibo/resources
 * List all Xibo resource IDs provisioned for a partner.
 */
router.get('/partners/:id/xibo/resources', async (req, res) => {
    const partnerId = parseInt(req.params.id, 10);
    try {
        const [cred, resources] = await Promise.all([
            dbGet('SELECT provision_status, xibo_base_url, provision_error FROM partner_xibo_credentials WHERE partner_id = ?', [partnerId]),
            dbAll('SELECT resource_type, xibo_resource_id, xibo_resource_name, meta, created_at FROM partner_xibo_resources WHERE partner_id = ? ORDER BY id ASC', [partnerId])
        ]);

        res.json({
            connected: !!cred,
            status: cred?.provision_status || 'not_configured',
            xibo_base_url: cred?.xibo_base_url || null,
            error: cred?.provision_error || null,
            resources: resources.map(r => ({
                type: r.resource_type,
                xibo_id: r.xibo_resource_id,
                name: r.xibo_resource_name,
                meta: r.meta ? JSON.parse(r.meta) : null,
                createdAt: r.created_at
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


/**
 * GET /admin/api/xibo/discover
 * Manually trigger auto-discovery of Xibo IDs from the current account.
 * Returns: placeholder media ID, per-screen playlist IDs, display list.
 * Useful after switching XIBO_BASE_URL to a new Xibo account.
 */
router.get('/xibo/discover', async (req, res) => {
    try {
        const result = await xiboService.autoDiscoverConfig();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /admin/api/xibo/config
 * Returns current active Xibo config (what's live in process.env right now).
 * Handy for confirming after a .env change that everything updated correctly.
 */
router.get('/xibo/config', (req, res) => {
    res.json({
        xibo_base_url: (process.env.XIBO_BASE_URL || '').replace(/\/$/, ''),
        client_id_set: !!process.env.XIBO_CLIENT_ID,
        placeholder_media_id: process.env.PLACEHOLDER_MEDIA_ID || null,
        screen_playlist_vars: Object.entries(process.env)
            .filter(([k]) => k.startsWith('SCREEN_') && k.endsWith('_PLAYLIST_ID'))
            .map(([k, v]) => ({ key: k, value: v }))
    });
});

// ─── ACTIVITY LOGS ────────────────────────────────────────────────────────────

/**
 * GET /admin/api/activity-logs
 * Returns paginated activity logs with optional filters.
 * Query params: module, action, user_id, from, to, search, page, limit
 */
router.get('/activity-logs', async (req, res) => {
    try {
        const { module: mod, action, user_id, from, to, search, page = 1, limit = 50 } = req.query;
        const safePage  = Math.max(1, parseInt(page, 10)  || 1);
        const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset    = (safePage - 1) * safeLimit;

        const wheres = [], params = [];
        if (mod)     { wheres.push('al.module    = ?');       params.push(mod); }
        if (action)  { wheres.push('al.action    = ?');       params.push(action); }
        if (user_id) { wheres.push('al.user_id   = ?');       params.push(user_id); }
        if (from)    { wheres.push('al.created_at >= ?');     params.push(from); }
        if (to)      { wheres.push('al.created_at <= ?');     params.push(to); }
        if (search)  { wheres.push('al.description LIKE ?');  params.push(`%${search}%`); }

        const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';

        const [rows, countRow] = await Promise.all([
            dbAll(`
                SELECT al.*, u.username, u.email as user_email
                FROM activity_logs al
                LEFT JOIN users u ON al.user_id = u.id
                ${where}
                ORDER BY al.created_at DESC
                LIMIT ? OFFSET ?
            `, [...params, safeLimit, offset]),
            dbGet(`SELECT COUNT(*) as total FROM activity_logs al ${where}`, params)
        ]);

        res.json({
            data:  rows,
            total: countRow?.total || 0,
            page:  safePage,
            limit: safeLimit,
            pages: Math.ceil((countRow?.total || 0) / safeLimit)
        });
    } catch (err) {
        console.error('[Admin API] Activity Logs Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /admin/api/activity-logs/stats
 * Summary of recent activity grouped by module and action. Used for dashboard widget.
 */
router.get('/activity-logs/stats', async (req, res) => {
    try {
        const [moduleBreakdown, actionBreakdown, recentErrors, activityTrend] = await Promise.all([
            dbAll(`SELECT module, COUNT(*) as count FROM activity_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY module ORDER BY count DESC LIMIT 10`),
            dbAll(`SELECT action, COUNT(*) as count FROM activity_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY action ORDER BY count DESC`),
            dbAll(`SELECT id, module, description, created_at, ip_address FROM activity_logs WHERE action = 'ERROR' ORDER BY created_at DESC LIMIT 5`),
            dbAll(`SELECT DATE(created_at) as date, COUNT(*) as count FROM activity_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY date ASC`)
        ]);
        res.json({ moduleBreakdown, actionBreakdown, recentErrors, activityTrend });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;








