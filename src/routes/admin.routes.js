const express = require('express');
const router = express.Router();
const { dbRun, dbAll, dbGet } = require('../db/database');
const xiboService = require('../services/xibo.service');
const statsService = require('../services/stats.service');
const { logActivity, ACTION, MODULE } = require('../services/activity-logger.service');
const { hasPermission } = require('../middleware/access.middleware');
const { generateId } = require('../utils/id.utils.js');
const { getAuth } = require('../auth.js');

// ─── ID VALIDATION MIDDLEWARE ────────────────────────────────────────────────
// System-wide protection against 'null', 'undefined' or non-numeric IDs in routes
router.param('id', (req, res, next, id) => {
    if (id === 'null' || id === 'undefined' || isNaN(parseInt(id, 10))) {
        return res.status(400).json({ error: `Invalid ID parameter: ${id}` });
    }
    next();
});

// ─── DASHBOARD OVERVIEW ───

/**
 * GET /api/admin/dashboard
 */
router.get('/dashboard', hasPermission('audit:view'), async (req, res) => {
    try {
        const [
            totalBrandsObj,
            totalPartnersObj,
            monthlyRevenueObj,
            rawDisplays,
            totalSlotsObj,
            assignedSlotsObj,
            revenueTrend
        ] = await Promise.all([
            dbGet('SELECT COUNT(*) as count FROM brands'),
            dbGet('SELECT COUNT(*) as count FROM partners'),
            dbGet("SELECT SUM(amount) as total FROM invoices WHERE status = 'Paid'"),
            xiboService.getClockOffset().then(() => xiboService.getDisplays()).catch(e => {
                console.warn('[Admin API] Xibo Displays unreachable:', e.message);
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
            `)
        ]);
        
        const isSyncing = rawDisplays.syncing || false;
        const displays = isSyncing ? [] : rawDisplays;
        
        const totalScreens = displays.length;
        const onlineScreens = displays.filter(d => xiboService.getDisplayHealth(d).status === 'Online').length;
        const availableSlotsCount = (totalSlotsObj && totalSlotsObj.count > 0) ? (totalSlotsObj.count - assignedSlotsObj.count) : (totalScreens * 20);

        let totalImpressions = 0;
        // Sum ALL verified proof-of-play records from local DB
        const totalPlaysObj = await dbGet(
            `SELECT COALESCE(SUM(count), 0) as total FROM daily_media_stats`
        ).catch(() => ({ total: 0 }));
        totalImpressions = totalPlaysObj?.total || 0;

        res.json({
            totalScreens,
            totalImpressions,
            onlineScreens,
            availableSlots: availableSlotsCount,
            totalBrands: totalBrandsObj.count,
            totalPartners: totalPartnersObj.count,
            monthlyRevenue: monthlyRevenueObj.total || 0,
            revenueTrend,
            syncing: isSyncing,
            recentAlerts: displays
                .filter(d => xiboService.getDisplayHealth(d).status !== 'Online')
                .slice(0, 5)
                .map(d => {
                    const health = xiboService.getDisplayHealth(d);
                    return { 
                        type: health.status === 'Stale' ? 'warning' : 'danger', 
                        text: `Screen ${d.display || d.name || d.displayId || 'Unknown'} is ${health.status}` 
                    };
                })
        });
    } catch (err) {
        console.error('[Admin API] Dashboard Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/health/xibo
 */
router.get('/health/xibo', hasPermission('audit:view'), async (req, res) => {
    try {
        const token = await xiboService.getAccessToken().catch(() => null);
        const monitor = require('../services/screen.monitor');
        res.json({
            status: token ? 'Connected' : 'Disconnected',
            baseUrl: xiboService.baseUrl,
            apiPrefix: xiboService._apiPrefix,
            circuitBreaker: {
                open: xiboService.circuitOpen,
                failureCount: xiboService.failureCount
            },
            monitor: monitor.getStatus(),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ status: 'Error', error: err.message });
    }
});

// ─── UTILITIES ───
const sanitizeUsername = (str) => (str || '').toLowerCase().replace(/[^a-z0-9._-]/g, '_');

router.get('/brands/debug', async (req, res) => {
    try {
        const brands = await dbAll('SELECT id, name, extra_fields, custom_fields FROM brands ORDER BY id DESC LIMIT 2');
        res.json({ success: true, brands});
    } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── BRANDS ───

/** 
 * GET /api/admin/brands - List all registered brands with metrics.
 */
router.get('/brands', hasPermission('screen:manage'), async (req, res) => {
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
router.get('/brands/:id', hasPermission('screen:manage'), async (req, res) => {
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
router.post('/brands', hasPermission('*'), async (req, res) => {
    const { company_name, name, industry, contact_person, email, phone, password, extra_fields, customFields } = req.body;
    const finalName = company_name || name;
    
    if (!finalName || !email) {
        return res.status(400).json({ error: 'Brand name and email are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    // Clean empty fields from customFields array
    const cleanedCustomFields = Array.isArray(customFields) 
        ? customFields.filter(f => f && f.key && f.key.trim() !== '') 
        : [];

    try {
        const existing = await dbGet('SELECT id FROM brands WHERE email = ?', [email]);
        if (existing) return res.status(409).json({ error: 'Email already exists' });

        const result = await dbRun(
            `INSERT INTO brands (name, industry, contact_person, email, phone, status, extra_fields, custom_fields) VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)`,
            [finalName, industry, contact_person, email, phone, JSON.stringify(extra_fields || {}), JSON.stringify(cleanedCustomFields)]
        );
        
        const { auth } = await getAuth();
        try {
            await auth.api.signUpEmail({
                body: {
                    name: contact_person || finalName,
                    username: sanitizeUsername(email),
                    email: email,
                    password: password || 'Brand@123',
                    role: 'Brand',
                    brand_id: result.id
                }
            });
        } catch (authErr) {
            console.error(`[Admin API] User creation failed for brand ${result.id}. Cleaning up brand record...`);
            await dbRun('DELETE FROM brands WHERE id = ?', [result.id]);
            throw new Error(`Failed to create brand account: ${authErr.message}`);
        }

        logActivity({ action: ACTION.CREATE, module: MODULE.BRAND, description: `Brand "${finalName}" created (ID: ${result.id})`, req });
        res.status(201).json({ success: true, brand_id: result.id });
    } catch(err) {
        logActivity({ action: ACTION.ERROR, module: MODULE.BRAND, description: `Failed to create brand "${finalName}": ${err.message}`, req });
        res.status(500).json({ error: err.message });
    }
});

// ─── USERS MANAGEMENT ───

/** GET /admin/api/users - List all users */
router.get('/users', hasPermission('user:view'), async (req, res) => {
    try {
        const users = await dbAll('SELECT id, username, email, role, brand_id, partner_id, created_at FROM users');
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /admin/api/users/:id - Single user */
router.get('/users/:id', hasPermission('user:view'), async (req, res) => {
    try {
        const user = await dbGet('SELECT id, username, email, role, brand_id, partner_id, created_at FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /admin/api/users - Create user (SuperAdmin only) */
router.post('/users', hasPermission('*'), async (req, res) => {
    try {
        const { username, email, password, role, brand_id, partner_id } = req.body;
        const { auth } = await getAuth();
        const resObj = await auth.api.signUpEmail({
            body: {
                name: username,
                username: sanitizeUsername(username),
                email: email,
                password: password,
                role: role,
                brand_id: brand_id,
                partner_id: partner_id
            }
        });
        
        res.status(201).json({ success: true, id: resObj?.user?.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** PUT /admin/api/users/:id - Update user (SuperAdmin only) */
router.put('/users/:id', hasPermission('*'), async (req, res) => {
    try {
        const { username, email, role, brand_id, partner_id } = req.body;
        await dbRun(
            'UPDATE users SET username = ?, email = ?, role = ?, brand_id = ?, partner_id = ? WHERE id = ?',
            [username, email, role, brand_id, partner_id, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /admin/api/users/:id - Delete user (SuperAdmin only) */
router.delete('/users/:id', hasPermission('*'), async (req, res) => {
    try {
        await dbRun('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/brands/:id/approve', hasPermission('*'), async (req, res) => {
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
    console.log(`[Admin API] PUT /brands/${req.params.id} body:`, JSON.stringify(req.body));
    const { name, industry, contact_person, email, phone, status, password, extra_fields, customFields } = req.body;
    
    // Clean empty fields
    const cleanedCustomFields = Array.isArray(customFields) 
        ? customFields.filter(f => f && f.key && f.key.trim() !== '') 
        : [];

    try {
        await dbRun(
            `UPDATE brands SET name=?, industry=?, contact_person=?, email=?, phone=?, status=?, extra_fields=?, custom_fields=? WHERE id=?`,
            [name, industry, contact_person, email, phone, status, JSON.stringify(extra_fields || {}), JSON.stringify(cleanedCustomFields), req.params.id]
        );

        if (email && password) {
            const { auth } = await getAuth();
            const user = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
            if (user) {
                // If user exists, change their password.
                await auth.api.changePassword({
                    body: { newPassword: password }
                }).catch(async (e) => {
                    // Fallback to manual db update if changePassword fails without context
                    const { hashPassword } = await import('@better-auth/utils/password');
                    const hash = await hashPassword(password);
                    await dbRun('UPDATE account SET password = ? WHERE userId = ?', [hash, user.id]);
                    await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user.id]);
                });
            } else {
                // User doesn't exist yet, create them.
                await auth.api.signUpEmail({
                    body: {
                        name: contact_person || name,
                        username: sanitizeUsername(email),
                        email: email,
                        password: password,
                        role: 'Brand',
                        brand_id: req.params.id
                    }
                });
            }
        }

        logActivity({ action: ACTION.UPDATE, module: MODULE.BRAND, description: `Brand ID ${req.params.id} updated`, req });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** 
 * GET /api/admin/brands/:id/impersonate
 * High-privilege route allowing admins to act as a brand user.
 * Generates a direct session and redirects to the brand portal.
 */
router.get('/brands/:id/impersonate', hasPermission('*'), async (req, res) => {
    const brandId = req.params.id;
    try {
        // 1. Find a user associated with this brand
        const user = await dbGet('SELECT id, email, username FROM users WHERE brand_id = ? LIMIT 1', [brandId]);
        
        if (!user) {
            return res.status(404).send(`
                <html>
                    <body style="font-family:sans-serif; padding:40px; text-align:center;">
                        <h2>No User Found</h2>
                        <p>This brand has no associated user account to impersonate.</p>
                        <button onclick="window.close()">Close Window</button>
                    </body>
                </html>
            `);
        }

        // 2. Generate a manual session in the Better Auth session table
        const sessionId = generateId('sess_');
        const token = generateId('tok_');
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

        await dbRun(
            'INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent) VALUES (?, ?, ?, ?, ?, ?)',
            [sessionId, user.id, token, expiresAt, req.ip, req.headers['user-agent'] || 'Admin Impersonation']
        );

        // 3. Set the Better Auth session cookie
        // Note: Cookie name must match better-auth configuration (default is better-auth.session-token)
        const isProd = process.env.NODE_ENV === 'production';
        res.cookie('better-auth.session-token', token, {
            httpOnly: true,
            secure: isProd,
            expires: expiresAt,
            path: '/',
            sameSite: 'lax'
        });

        logActivity({
            action: ACTION.LOGIN,
            module: MODULE.AUTH,
            description: `Admin impersonated Brand User: ${user.email} (Brand ID: ${brandId})`,
            req
        });

        // 4. Redirect to the Brand Portal
        res.redirect('/brandportal/index.html');
    } catch (err) {
        console.error('[Admin API] Impersonation Error:', err.message);
        res.status(500).json({ error: err.message });
    }
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
        logActivity({ action: ACTION.CREATE, module: MODULE.BILLING, description: `Subscription created for Brand ID ${brand_id} (Plan: ${plan_name})`, req });
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
        logActivity({ action: ACTION.UPDATE, module: MODULE.BILLING, description: `Subscription ID ${req.params.id} updated`, req });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/subscriptions/:id - Delete a subscription. */
router.delete('/subscriptions/:id', async (req, res) => {
    try {
        const result = await dbRun('DELETE FROM subscriptions WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Subscription not found' });
        logActivity({ action: ACTION.DELETE, module: MODULE.BILLING, description: `Subscription ID ${req.params.id} deleted`, req });
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
        
        logActivity({
            action: ACTION.ASSIGN,
            module: MODULE.CREATIVE,
            description: `Media ID ${mediaId} linked to Brand ID ${brandId}${displayId ? ' on Display '+displayId : ''}`,
            req
        });

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
        logActivity({
            action: brand_id ? ACTION.ASSIGN : ACTION.UNASSIGN,
            module: MODULE.CREATIVE,
            description: brand_id ? `Media ID ${mediaId} manually assigned to Brand ID ${brand_id}` : `Media ID ${mediaId} unlinked from all brands`,
            req
        });
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
        const userId = generateId('user_');
        // 1. Create or update user record
        await dbRun(
            `INSERT INTO users (id, username, email, password_hash, role, partner_id, force_password_reset) 
             VALUES (?, ?, ?, ?, 'Partner', ?, 1)
             ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id), role = VALUES(role), password_hash = VALUES(password_hash)`,
            [userId, email, email, hash, result.id]
        );

        // Get the real string userId (either newly created or existing)
        const user = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
        const realUserId = user ? user.id : userId;
        
        // 2. Ensure Better Auth account exists and is synced
        if (realUserId) {
            await dbRun(
                `INSERT INTO account (id, userId, providerId, accountId, password) 
                 VALUES (?, ?, 'credential', ?, ?)
                 ON DUPLICATE KEY UPDATE password = VALUES(password)`,
                [`acc_${realUserId}`, realUserId, email, hash]
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
            const user = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
            const userId = user ? user.id : generateId('user_');

            const userUpdateSql = hash 
                ? `INSERT INTO users (id, username, email, password_hash, role, partner_id, force_password_reset) 
                   VALUES (?, ?, ?, ?, 'Partner', ?, 1)
                   ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id), role = VALUES(role), password_hash = VALUES(password_hash)`
                : `INSERT INTO users (id, username, email, password_hash, role, partner_id, force_password_reset) 
                   VALUES (?, ?, ?, '---', 'Partner', ?, 0)
                   ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id), role = VALUES(role)`;
            
            const params = hash ? [userId, email, email, hash, req.params.id] : [userId, email, email, req.params.id];
            
            // Perform the upsert
            await dbRun(userUpdateSql, params);

            // Sync account if we have a userId and password was provided
            if (hash && userId) {
                // Better Auth 'account' table requires an 'id' string.
                const accountIdStr = `acc_${userId}`;
                await dbRun(
                    `INSERT INTO account (id, userId, providerId, accountId, password) 
                     VALUES (?, ?, 'credential', ?, ?)
                     ON DUPLICATE KEY UPDATE password = VALUES(password)`,
                    [accountIdStr, userId, email, hash]
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
    const partnerId = parseInt(req.params.id, 10);
    const { screenIds } = req.body; 
    
    if (isNaN(partnerId)) return res.status(400).json({ error: 'Invalid partner ID' });
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

        logActivity({ 
            action: ACTION.SYNC, 
            module: MODULE.PARTNER, 
            description: `Partner ID ${partnerId} screens updated (Count: ${screenIds.length})`, 
            req 
        });

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
        // Non-blocking background sync so the UI doesn't hang waiting for the external API
        screenService.syncDisplays().catch(e => console.error('[Background Sync]', e.message));

        const screens = await dbAll(`
            SELECT s.*, p.name as partner_name 
            FROM screens s
            LEFT JOIN partners p ON s.partner_id = p.id
            ORDER BY s.id DESC
        `);
        res.json(screens);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/admin/screens/pending-displays
 * Returns Xibo displays that are connected but not yet authorized (licensed=0).
 */
router.get('/screens/pending-displays', async (req, res) => {
    try {
        const axios = require('axios');
        const headers = await xiboService.getHeaders();
        const resp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display`, {
            headers,
            params: { licensed: 0, length: 200 },
            timeout: 10000
        });
        const pending = Array.isArray(resp.data) ? resp.data : [];
        res.json(pending.map(d => ({
            displayId: d.displayId,
            display: d.display,
            license: d.license || '',
            activationCode: d.activationCode || '',
            lastAccessed: d.lastAccessed || null
        })));
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/screens/register-xibo
 * Authorizes a brand new Xibo display using an activation code (hardware key).
 */
router.post('/screens/register-xibo', hasPermission('screen:manage'), async (req, res) => {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Screen name and Activation Code are required' });
    
    try {
        const display = await xiboService.addDisplay(name, code);
        
        // Success! Now force a sync to create/update local record
        const screenService = require('../services/screen.service');
        await screenService.syncDisplays();
        
        logActivity({ action: ACTION.CREATE, module: MODULE.SCREEN, description: `Xibo Display "${name}" registered via code (Xibo ID: ${display.displayId})`, req });
        res.json({ success: true, display });
    } catch (err) {
        console.error('[Admin API] Xibo Register Error:', err.message);
        res.status(500).json({ error: err.message });
    }
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
    try {
        const existing = await dbGet('SELECT * FROM screens WHERE id = ?', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'Screen not found' });

        let { 
            name, city, address, latitude, longitude, timezone, partner_id, notes, 
            xibo_display_id, status, orientation, resolution 
        } = req.body;
        
        // Merge with existing data to prevent unintentional wiping of fields not in the request
        name = name !== undefined ? name : existing.name;
        city = city !== undefined ? city : existing.city;
        address = address !== undefined ? address : existing.address;
        latitude = latitude !== undefined ? latitude : existing.latitude;
        longitude = longitude !== undefined ? longitude : existing.longitude;
        timezone = timezone !== undefined ? timezone : existing.timezone;
        partner_id = partner_id !== undefined ? partner_id : existing.partner_id;
        notes = notes !== undefined ? notes : existing.notes;
        xibo_display_id = xibo_display_id !== undefined ? xibo_display_id : existing.xibo_display_id;
        status = status !== undefined ? status : existing.status;
        orientation = orientation !== undefined ? orientation : existing.orientation;
        resolution = resolution !== undefined ? resolution : existing.resolution;
        
        // Sanitize coordinates to handle empty strings or UI nulls
        if (latitude === '' || latitude === undefined) latitude = null;
        if (longitude === '' || longitude === undefined) longitude = null;
        if (latitude !== null) latitude = parseFloat(latitude);
        if (longitude !== null) longitude = parseFloat(longitude);

        const query = `UPDATE screens SET name=?, city=?, address=?, latitude=?, longitude=?, timezone=?, partner_id=?, notes=?, xibo_display_id=?, status=?, orientation=?, resolution=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`;
        const params = [name, city, address, latitude, longitude, timezone, partner_id, notes, xibo_display_id, status, orientation, resolution, req.params.id];

        await dbRun(query, params);
        
        // Push updates to Xibo - await it to ensure consistency before UI refresh
        const screenService = require('../services/screen.service');
        try {
            await screenService.pushToXibo(req.params.id);
        } catch (e) {
            console.error('[Admin API] Xibo push failed during update:', e.message);
        }

        logActivity({ action: ACTION.UPDATE, module: MODULE.SCREEN, description: `Screen ID ${req.params.id} updated`, req });
        res.json({ success: true });
    } catch(err) { 
        res.status(500).json({ error: err.message }); 
    }
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
                `SELECT * FROM subscriptions WHERE brand_id = ? AND status = 'Active' AND DATE(start_date) <= CURDATE() AND DATE(end_date) >= CURDATE() ORDER BY id DESC LIMIT 1`,
                [brand_id]
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

        // ─── AUTO-LINK: sync media_brands whenever a slot is assigned/unassigned ───
        if (brand_id && mId) {
            // Slot assigned to brand WITH a media file → auto-link in media_brands
            await dbRun(
                'REPLACE INTO media_brands (mediaId, brand_id, status) VALUES (?, ?, "Approved")',
                [mId, brand_id]
            );
            console.log(`[AutoLink] Media ${mId} auto-linked to Brand ${brand_id} via slot assign`);
        } else if (!brand_id && mId) {
            // Slot unassigned → remove media_brands entry ONLY if no other active slot references it
            const otherSlot = await dbGet(
                'SELECT id FROM slots WHERE mediaId = ? AND brand_id IS NOT NULL AND NOT (displayId = ? AND slot_number = ?) LIMIT 1',
                [mId, displayId, slot_number]
            );
            if (!otherSlot) {
                await dbRun('DELETE FROM media_brands WHERE mediaId = ?', [mId]);
                console.log(`[AutoLink] Media ${mId} unlinked from all brands (no active slots remain)`);
            }
        }
        // ─────────────────────────────────────────────────────────────────────────

        const io = req.app.get('io');
        if (io) {
            let brandName = 'Unassigned';
            if (brand_id) {
                const brand = await dbGet('SELECT name FROM brands WHERE id = ?', [brand_id]);
                if (brand) brandName = brand.name;
            }
            io.emit('slot_assigned', { displayId, slot_number, brand_id: brand_id || null, brandName, timestamp: Date.now() });
        }

        logActivity({
            action: brand_id ? ACTION.ASSIGN : ACTION.UNASSIGN,
            module: MODULE.SLOT,
            description: brand_id 
                ? `Slot ${slot_number} on Display ${displayId} assigned to Brand ID ${brand_id}` 
                : `Slot ${slot_number} on Display ${displayId} unassigned`,
            req
        });

        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/admin/slots/sync-brands
 * Backfill: auto-link all existing slots that have a mediaId and brand_id
 * but are missing a corresponding media_brands record (one-time repair).
 */
router.post('/slots/sync-brands', async (req, res) => {
    try {
        const activeSlotsWithMedia = await dbAll(
            'SELECT mediaId, brand_id FROM slots WHERE mediaId IS NOT NULL AND brand_id IS NOT NULL AND status = "Active"'
        );
        let linked = 0;
        for (const slot of activeSlotsWithMedia) {
            await dbRun(
                'REPLACE INTO media_brands (mediaId, brand_id, status) VALUES (?, ?, "Approved")',
                [slot.mediaId, slot.brand_id]
            );
            linked++;
        }
        console.log(`[SyncBrands] Backfilled ${linked} media-to-brand links from slots.`);
        statsService.invalidateCache();
        res.json({ success: true, linked });
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
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
router.get('/creatives/pending', hasPermission('creative:moderate'), async (req, res) => {
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
                mediaType: x ? x.mediaType : 'video',
                thumbnailUrl: x ? `/xibo/library/download/${p.mediaId}?thumbnail=1` : null,
                previewUrl: x ? `/xibo/library/download/${p.mediaId}` : null
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
        logActivity({ action: ACTION.APPROVE, module: MODULE.CREATIVE, description: `Creative (mediaId: ${id}) approved`, req });
        res.json({ success: true, message: 'Creative approved successfully.' });
    } catch (err) {
        logActivity({ action: ACTION.ERROR, module: MODULE.CREATIVE, description: `Failed to approve creative mediaId ${req.params.id}: ${err.message}`, req });
        res.status(500).json({ error: err.message });
    }
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
        logActivity({ action: ACTION.REJECT, module: MODULE.CREATIVE, description: `Creative (mediaId: ${id}) rejected`, req });
        res.json({ success: true, message: 'Creative rejected.' });
    } catch (err) {
        logActivity({ action: ACTION.ERROR, module: MODULE.CREATIVE, description: `Failed to reject creative mediaId ${req.params.id}: ${err.message}`, req });
        res.status(500).json({ error: err.message });
    }
});


/** DELETE /api/admin/creatives/:id - Delete a creative. */
router.delete('/creatives/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Check if media is assigned to any slots
        const assignments = await dbGet('SELECT COUNT(*) as count FROM slots WHERE mediaId = ?', [id]);
        if (assignments && assignments.count > 0) {
            return res.status(400).json({ error: 'Cannot delete media that is currently assigned to slots. Unassign it first.' });
        }

        // 2. Delete from local database (media_brands) - we don't care if it fails (changes === 0) since it might just be unassigned
        await dbRun('DELETE FROM media_brands WHERE mediaId = ?', [id]);
        
        // 3. Delete from Xibo
        try {
            const xiboService = require('../services/xibo.service');
            await xiboService.deleteMedia(id);
        } catch (e) {
            console.error(`[Admin API] Failed to delete media ${id} from Xibo:`, e.message);
            // We still proceed since we deleted it locally, or it was already gone.
        }

        logActivity({ action: ACTION.DELETE, module: MODULE.CREATIVE, description: `Creative (mediaId: ${id}) deleted`, req });
        res.json({ success: true, message: 'Creative deleted successfully.' });
    } catch (err) {
        logActivity({ action: ACTION.ERROR, module: MODULE.CREATIVE, description: `Failed to delete creative mediaId ${req.params.id}: ${err.message}`, req });
        res.status(500).json({ error: err.message });
    }
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
 */
router.get('/activity-logs', hasPermission('audit:view'), async (req, res) => {
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








