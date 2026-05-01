const express = require('express');
const router = express.Router();
const { dbRun, dbAll, dbGet } = require('../db/database');
const xiboService = require('../services/xibo.service');
const statsService = require('../services/stats.service');
const { logActivity, ACTION, MODULE } = require('../services/activity-logger.service');
const { hasPermission } = require('../middleware/access.middleware');
const { generateId } = require('../utils/id.utils.js');
const { getAuth } = require('../auth.js');

/**
 * sanitizeUsername
 * Converts an email or name into a Better Auth compatible username.
 */
function sanitizeUsername(str) {
    if (!str) return 'user_' + Math.random().toString(36).substring(7);
    return str.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_{2,}/g, '_');
}

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
        // Use the same source as the Analytics page (getAllMediaStats) so the
        // "Total PoP Plays" KPI is globally consistent across all views.
        try {
            const allMediaStats = await statsService.getAllMediaStats();
            totalImpressions = allMediaStats.reduce((sum, item) => sum + (item.totalPlays || 0), 0);
        } catch (_) { totalImpressions = 0; }

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

router.get('/brands/debug', hasPermission('audit:view'), async (req, res) => {
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
                (SELECT COUNT(*) FROM campaigns WHERE brand_id = b.id AND status = 'Active') AS active_campaigns,
                (
                    SELECT GROUP_CONCAT(DISTINCT CONCAT(sc.name, ' · S', sl.slot_number) SEPARATOR '; ')
                    FROM slots sl
                    JOIN screens sc ON sc.xibo_display_id = sl.displayId
                    WHERE sl.brand_id = b.id
                ) AS assigned_summary
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

router.get('/brands/:id/assignments', hasPermission('screen:manage'), async (req, res) => {
    const brandId = req.params.id;
    try {
        const [assignments, library] = await Promise.all([
            dbAll(`
                SELECT 
                    sl.slot_number,
                    sc.id AS displayId,
                    sc.name AS screen_name,
                    sc.status,
                    sl.creative_name,
                    sl.mediaId,
                    sub.plan_name AS subscription_name
                FROM slots sl
                LEFT JOIN screens sc ON sc.xibo_display_id = sl.displayId
                LEFT JOIN subscriptions sub ON sub.id = sl.subscription_id
                WHERE sl.brand_id = ?
                ORDER BY sc.name, sl.slot_number
            `, [brandId]),
            xiboService.getLibrary({ length: 500 }).catch(() => [])
        ]);

        // Enrich with media names from Xibo library if available
        const enriched = assignments.map(as => {
            let mediaName = as.creative_name;
            if (as.mediaId && library) {
                const media = library.find(m => String(m.mediaId) === String(as.mediaId));
                if (media) mediaName = media.name;
            }
            return { 
                ...as, 
                creative_name: mediaName || '-' 
            };
        });

        res.json(enriched);
    } catch (err) {
        console.error('Error fetching brand assignments:', err);
        res.status(500).json({ error: err.message });
    }
});

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
router.post('/brands', hasPermission('user:edit'), async (req, res) => {
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

/** 
 * GET /admin/api/users - List all users with status 
 */
router.get('/users', hasPermission('user:view'), async (req, res) => {
    try {
        const users = await dbAll(`
            SELECT u.id, u.username, u.name, u.email, u.role, u.brand_id, u.partner_id, u.createdAt,
                   MAX(s.updatedAt) as last_active
            FROM users u
            LEFT JOIN session s ON s.userId = u.id
            GROUP BY u.id
        `);
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /admin/api/users/online - Returns list of currently active admins
 */
router.get('/users/online', hasPermission('user:view'), async (req, res) => {
    try {
        const onlineUsers = await dbAll(`
            SELECT u.id, u.name, u.username, u.email, u.role, s.updatedAt as last_active
            FROM users u
            JOIN session s ON s.userId = u.id
            WHERE s.expiresAt > NOW()
              AND s.updatedAt > NOW() - INTERVAL 15 MINUTE
            ORDER BY s.updatedAt DESC
        `);
        // Remove duplicates if user has multiple active sessions
        const unique = [];
        const seen = new Set();
        for (const u of onlineUsers) {
            if (!seen.has(u.id)) {
                unique.push(u);
                seen.add(u.id);
            }
        }
        res.json(unique);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** GET /admin/api/users/:id - Single user */
router.get('/users/:id', hasPermission('user:view'), async (req, res) => {
    try {
        const user = await dbGet('SELECT id, username, email, role, brand_id, partner_id, createdAt FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** 
 * POST /admin/api/users/invite - Invite new admin (SuperAdmin only)
 */
router.post('/users/invite', hasPermission('*'), async (req, res) => {
    try {
        const { name, email, role, password } = req.body;
        if (!email || !password || !role) {
            return res.status(400).json({ error: 'Email, password and role are required.' });
        }

        const { auth } = await getAuth();
        const username = sanitizeUsername(email);

        // 1. Create the user using Better Auth
        const resObj = await auth.api.signUpEmail({
            body: {
                name: name || username,
                username: username,
                email: email,
                password: password,
                role: role,
                force_password_reset: 1
            }
        });

        const userId = resObj?.user?.id;
        if (!userId) throw new Error('Failed to create user account');

        // 2. Ensure force_password_reset is set
        await dbRun('UPDATE users SET force_password_reset = 1, name = ? WHERE id = ?', [name || '', userId]);

        logActivity({
            action: ACTION.CREATE,
            module: MODULE.AUTH,
            description: `Admin invited: ${email} (Role: ${role})`,
            req
        });

        res.status(201).json({ 
            success: true, 
            id: userId,
            message: 'Admin created! They must change password on first login.'
        });
    } catch (err) {
        console.error('Invite Error:', err);
        res.status(500).json({ error: err.message });
    }
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

/** PUT /admin/api/users/:id/role - Change user role (SuperAdmin only) */
router.put('/users/:id/role', hasPermission('*'), async (req, res) => {
    try {
        const { role } = req.body;
        if (!role) return res.status(400).json({ error: 'Role is required' });
        
        await dbRun('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
        
        logActivity({
            action: ACTION.UPDATE,
            module: MODULE.AUTH,
            description: `Role updated for user ID ${req.params.id} to ${role}`,
            req
        });
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /admin/api/users/:id - Delete user (SuperAdmin only) */
router.delete('/users/:id', hasPermission('*'), async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Prevent deleting self
        if (userId === req.user.id) {
            return res.status(400).json({ error: 'You cannot delete your own account.' });
        }

        await dbRun('DELETE FROM session WHERE userId = ?', [userId]);
        await dbRun('DELETE FROM account WHERE userId = ?', [userId]);
        await dbRun('DELETE FROM users WHERE id = ?', [userId]);
        
        logActivity({
            action: ACTION.DELETE,
            module: MODULE.AUTH,
            description: `User ID ${userId} deleted by admin`,
            req
        });
        
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /admin/api/users/:id/activity - Get user activity logs */
router.get('/users/:id/activity', hasPermission('user:view'), async (req, res) => {
    try {
        const logs = await dbAll(
            'SELECT * FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [req.params.id]
        );
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /admin/api/users/:id/sessions - Get active sessions */
router.get('/users/:id/sessions', hasPermission('user:view'), async (req, res) => {
    try {
        const sessions = await dbAll(
            'SELECT token, ipAddress, userAgent, createdAt, updatedAt, expiresAt FROM session WHERE userId = ? AND expiresAt > NOW() ORDER BY updatedAt DESC',
            [req.params.id]
        );
        res.json(sessions);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /admin/api/users/:id/sessions/:token - Revoke a session */
router.delete('/users/:id/sessions/:token', hasPermission('*'), async (req, res) => {
    try {
        await dbRun('DELETE FROM session WHERE userId = ? AND token = ?', [req.params.id, req.params.token]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /admin/api/users/:id/sessions - Revoke all sessions */
router.delete('/users/:id/sessions', hasPermission('*'), async (req, res) => {
    try {
        await dbRun('DELETE FROM session WHERE userId = ?', [req.params.id]);
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
router.patch('/brands/:id/disable', hasPermission('user:edit'), async (req, res) => {
    try {
        const result = await dbRun('UPDATE brands SET status = "Disabled" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Brand not found' });
        logActivity({ action: ACTION.UPDATE, module: MODULE.BRAND, description: `Brand ID ${req.params.id} disabled`, req });
        res.json({ success: true, brand_id: req.params.id, status: 'Disabled' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});


/** PUT /api/admin/brands/:id - Update brand profile. */
router.put('/brands/:id', hasPermission('user:edit'), async (req, res) => {
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
router.delete('/brands/:id', hasPermission('user:edit'), async (req, res) => {
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
router.get('/subscriptions', hasPermission('user:view'), async (req, res) => {
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
router.get('/subscriptions/brand/:brandId', hasPermission('user:view'), async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT sub.*, b.name as brand_name FROM subscriptions sub LEFT JOIN brands b ON sub.brand_id = b.id WHERE sub.brand_id = ? ORDER BY sub.id DESC`,
            [req.params.brandId]
        );
        res.json(rows);
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/admin/subscriptions - Create a new subscription. */
router.post('/subscriptions', hasPermission('user:edit'), async (req, res) => {
    let { brand_id, plan_name, start_date, end_date, screens_included, slots_included, cities, payment_status, status, notes } = req.body;
    if (!brand_id || !plan_name || !start_date || !end_date) {
        return res.status(400).json({ error: 'brand_id, plan_name, start_date, and end_date are required.' });
    }

    if (new Date(end_date) < new Date()) {
        return res.status(400).json({ error: 'Subscription end date cannot be in the past' });
    }
    
    // Ensure dates are stored in UTC format for accurate NOW() comparisons
    const formatToUTC = (iso) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
    start_date = formatToUTC(start_date);
    end_date = formatToUTC(end_date);

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
router.put('/subscriptions/:id', hasPermission('user:edit'), async (req, res) => {
    let { plan_name, start_date, end_date, screens_included, slots_included, cities, payment_status, status, notes } = req.body;
    
    if (end_date && new Date(end_date) < new Date()) {
        return res.status(400).json({ error: 'Subscription end date cannot be in the past' });
    }
    try {
        const formatToUTC = (iso) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
        start_date = formatToUTC(start_date);
        end_date = formatToUTC(end_date);

        const result = await dbRun(
            `UPDATE subscriptions SET plan_name=?, start_date=?, end_date=?, screens_included=?, slots_included=?, cities=?, payment_status=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            [plan_name, start_date, end_date, screens_included || 1, slots_included || 1, cities, payment_status, status, notes, req.params.id]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Subscription not found' });
        logActivity({ action: ACTION.UPDATE, module: MODULE.BILLING, description: `Subscription ID ${req.params.id} updated`, req });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/subscriptions/:id - Delete a subscription. */
router.delete('/subscriptions/:id', hasPermission('user:edit'), async (req, res) => {
    const subId = req.params.id;
    try {
        // 1. Unassign all slots associated with this subscription
        // We set status back to 'Available' and clear all brand/media links
        await dbRun(`
            UPDATE slots 
            SET brand_id = NULL, 
                status = 'Available', 
                subscription_id = NULL, 
                mediaId = NULL, 
                creative_name = NULL,
                playlist_id = NULL,
                xibo_widget_id = NULL,
                updated_at = CURRENT_TIMESTAMP 
            WHERE subscription_id = ?
        `, [subId]);

        // 2. Delete the subscription itself
        const result = await dbRun('DELETE FROM subscriptions WHERE id = ?', [subId]);
        if (result.changes === 0) return res.status(404).json({ error: 'Subscription not found' });
        
        logActivity({ action: ACTION.DELETE, module: MODULE.BILLING, description: `Subscription ID ${subId} deleted — associated slots unassigned`, req });
        res.json({ success: true });
    } catch(err) { 
        console.error('Error deleting subscription:', err);
        res.status(500).json({ error: err.message }); 
    }
});

/** 
 * GET /api/admin/brands/:brandId/subscription/:subscriptionId/assignments
 * List all screens and slots assigned to a specific brand under a specific subscription.
 */
router.get('/brands/:brandId/subscription/:subscriptionId/assignments', hasPermission('user:view'), async (req, res) => {
    const { brandId, subscriptionId } = req.params;
    try {
        // Find all screens linked to this brand via slots table
        const screens = await dbAll(`
            SELECT DISTINCT sc.xibo_display_id as displayId, sc.name, sc.city as location, sc.status
            FROM slots s
            JOIN screens sc ON sc.xibo_display_id = s.displayId
            WHERE s.brand_id = ? AND s.subscription_id = ?
        `, [brandId, subscriptionId]);

        // Find all slots linked to this brand and subscription
        const slots = await dbAll(`
            SELECT 
                sl.slot_number,
                sl.displayId,
                sc.name as screen_name,
                sc.status as screen_status,
                sc.city as location,
                sl.creative_name as media_name,
                sl.status as slot_status
            FROM slots sl
            LEFT JOIN screens sc ON sc.xibo_display_id = sl.displayId
            WHERE sl.subscription_id = ? AND sl.brand_id = ?
        `, [subscriptionId, brandId]);

        res.json({ screens, slots });
    } catch (err) {
        console.error('[Admin API] Assignments Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── BRAND METRICS & CAMPAIGNS ───

/**
 * GET /api/admin/brands/:id/metrics
 * Aggregates performance data for a specific brand.
 */
router.get('/brands/:id/metrics', hasPermission('audit:view'), async (req, res) => {
    const brandId = req.params.id;
    try {
        const [campaignsCount, slotsCount, spendSum, brandMedia, allStats, subCount] = await Promise.all([
            dbGet('SELECT COUNT(DISTINCT id) as count FROM campaigns WHERE brand_id = ?', [brandId]),
            dbGet('SELECT COUNT(*) as count FROM slots WHERE brand_id = ?', [brandId]),
            dbGet('SELECT SUM(amount) as total FROM invoices WHERE brand_id = ?', [brandId]),
            dbAll('SELECT mediaId FROM media_brands WHERE brand_id = ?', [brandId]),
            statsService.getAllMediaStats(),
            dbGet('SELECT COUNT(*) as count FROM subscriptions WHERE brand_id = ?', [brandId])
        ]);
        
        const myMediaIds = new Set(brandMedia.map(bm => String(bm.mediaId)));
        const totalPlays = allStats.reduce((sum, s) => {
            if (myMediaIds.has(String(s.mediaId))) return sum + (s.totalPlays || 0);
            return sum;
        }, 0);

        res.json({
            totalCampaigns: campaignsCount.count || 0,
            totalSlots: slotsCount.count || 0,
            totalSpend: spendSum.total || 0,
            totalPlays: totalPlays,
            totalSubscriptions: subCount.count || 0
        });
    } catch (err) {
        console.error('[Admin API] Brand Metrics Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/** GET /api/admin/brands/:id/campaigns - List all campaigns (media) for a specific brand. */
router.get('/brands/:id/campaigns', hasPermission('creative:view'), async (req, res) => {
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
router.get('/brands/:id/creatives', hasPermission('creative:view'), async (req, res) => {
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
router.post('/media/link-brand', hasPermission('creative:edit'), async (req, res) => {
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
router.get('/media/brands', hasPermission('creative:view'), async (req, res) => {
    try {
        const mappings = await dbAll('SELECT * FROM media_brands');
        res.json(mappings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/admin/media/assign - Admin Portal forced media-to-brand mapping */
router.post('/media/assign', hasPermission('creative:edit'), async (req, res) => {
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

// ─── SCREENS ───

/**
 * GET /api/admin/screens
 * Syncs Xibo displays with the local database and returns the full list of screens.
 */
router.get('/screens', hasPermission('screen:manage'), async (req, res) => {
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

/** GET /api/admin/screens/logs (Global) */
router.get('/screens/logs', hasPermission('audit:view'), async (req, res) => {
    try {
        const logs = await dbAll(`
            SELECT l.*, s.name as screen_name 
            FROM screen_event_logs l
            JOIN screens s ON l.screen_id = s.id
            ORDER BY l.created_at DESC 
            LIMIT 200
        `);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/screens/pending-displays
 * Returns Xibo displays that are connected but not yet authorized (licensed=0).
 */
router.get('/screens/pending-displays', hasPermission('screen:manage'), async (req, res) => {
    try {
        const axios = require('axios');
        const headers = await xiboService.getHeaders();
        const resp = await axios.get(`${xiboService.baseUrl}${xiboService._apiPrefix}/display`, {
            headers,
            params: { licensed: 0, length: 100 },
            timeout: 10000
        });
        
        let pending = Array.isArray(resp.data) ? resp.data : [];
        
        // Also get all currently linked Xibo IDs from our DB
        const { dbAll } = require('../db/database');
        const linkedDisplays = await dbAll('SELECT xibo_display_id FROM screens WHERE xibo_display_id IS NOT NULL');
        const linkedIds = linkedDisplays.map(ld => ld.xibo_display_id);

        // Filter out displays that are already in our local CRM
        pending = pending.filter(d => !linkedIds.includes(d.displayId));

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
 * GET /api/admin/screens/verify-license/:code
 * Checks if a license (hardware key) exists in Xibo and returns display details.
 */
router.get('/screens/verify-license/:code', hasPermission('screen:manage'), async (req, res) => {
    try {
        const upperCode = req.params.code.toUpperCase().trim();
        const xiboDisplays = await xiboService.getDisplays();
        const matched = xiboDisplays.find(d => 
            (d.license || '').replace(/:/g, '').toUpperCase().includes(upperCode) ||
            (d.activationCode || '').toUpperCase() === upperCode ||
            (d.macAddress || '').replace(/:/g, '').toUpperCase().includes(upperCode)
        );

        if (!matched) {
            return res.status(404).json({ error: 'No display found with this license/hardware key in Xibo.' });
        }

        res.json({
            success: true,
            displayId: matched.displayId,
            name: matched.display,
            licensed: matched.licensed,
            macAddress: matched.macAddress || matched.currentMacAddress,
            clientAddress: matched.clientAddress || matched.lanIpAddress,
            hardware: `${matched.brand || ''} ${matched.model || ''}`.trim()
        });
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
router.post('/screens', hasPermission('screen:manage'), async (req, res) => {
    const { name, city, address, latitude, longitude, timezone, partner_id, notes, license } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const result = await dbRun(
            `INSERT INTO screens (name, city, address, latitude, longitude, timezone, partner_id, notes, status, license) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Offline', ?)`,
            [name, city, address, latitude, longitude, timezone || 'Asia/Kolkata', partner_id || null, notes, license || null]
        );
        
        const screenService = require('../services/screen.service');
        const srv = new screenService();
        await srv.logEvent(result.id, 'provisioning', `Screen record created manually in Admin Center.`);

        logActivity({ action: ACTION.CREATE, module: MODULE.SCREEN, description: `Screen "${name}" (ID: ${result.id}) added`, req });
        res.json({ success: true, id: result.id });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/admin/screens/:id - Single screen details. */
router.get('/screens/:id', hasPermission('screen:manage'), async (req, res) => {
    console.log(`[Admin API] GET /screens/${req.params.id}`);
    try {
        const screen = await dbGet(`
            SELECT s.*, p.name as partner_name
            FROM screens s
            LEFT JOIN partners p ON p.id = s.partner_id
            WHERE s.id = ? OR s.xibo_display_id = ?
            LIMIT 1
        `, [req.params.id, req.params.id]);

        if (!screen) return res.status(404).json({ error: 'Screen not found' });

        // Enrich with live status if possible
        const rawXibo = await xiboService.getDisplays().catch(() => []);
        const xiboDisplays = rawXibo.data || (Array.isArray(rawXibo) ? rawXibo : []);
        const xibo = xiboDisplays.find(d => d.displayId === screen.xibo_display_id);
        screen.online = xibo ? !!xibo.loggedIn : false;
        if (xibo && xibo.lastAccessed) screen.lastAccessed = xibo.lastAccessed;

        res.json(screen);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/screens/:id', hasPermission('screen:manage'), async (req, res) => {
    const { name, city, address, latitude, longitude, timezone, partner_id, notes, status, xibo_display_id, orientation, resolution, license } = req.body;
    try {
        const existing = await dbGet('SELECT * FROM screens WHERE id = ?', [req.params.id]);
        if (!existing) return res.status(404).json({ error: 'Screen not found' });

        let finalXiboId = xibo_display_id || existing.xibo_display_id;
        let updateHardware = {};

        // Auto-link & Authorize logic
        if (license && license !== existing.license) {
            try {
                const upperCode = license.toUpperCase().trim();
                const xiboDisplays = await xiboService.getDisplays();
                const matched = xiboDisplays.find(d => 
                    (d.license || '').replace(/:/g, '').toUpperCase().includes(upperCode) ||
                    (d.activationCode || '').toUpperCase() === upperCode ||
                    (d.macAddress || '').replace(/:/g, '').toUpperCase().includes(upperCode)
                );
                
                if (matched) {
                    finalXiboId = matched.displayId;
                    updateHardware = {
                        mac_address: matched.macAddress || matched.currentMacAddress,
                        client_address: matched.clientAddress || matched.lanIpAddress,
                        brand: matched.brand,
                        device_model: matched.model
                    };
                    
                    // If matched but not authorized in Xibo, authorize it now!
                    if (matched.licensed !== 1) {
                        console.log(`[Admin API] Authorizing display ${matched.displayId} during license update...`);
                        await xiboService.registerDisplay(matched.displayId, name || existing.name);
                    }
                    
                    console.log(`[Admin API] Auto-linked screen ${req.params.id} to Xibo ID ${finalXiboId} via license: ${license}`);
                }
            } catch (e) {
                console.warn('[Admin API] Auto-link/Auth failed during update:', e.message);
            }
        }

        await dbRun(
            `UPDATE screens 
             SET name = ?, city = ?, address = ?, latitude = ?, longitude = ?, timezone = ?, partner_id = ?, notes = ?, status = ?, xibo_display_id = ?, orientation = ?, resolution = ?, license = ?,
                 mac_address = COALESCE(?, mac_address), client_address = COALESCE(?, client_address), brand = COALESCE(?, brand), device_model = COALESCE(?, device_model)
             WHERE id = ?`,
            [
                name || existing.name, 
                city || existing.city, 
                address || existing.address, 
                latitude || existing.latitude, 
                longitude || existing.longitude, 
                timezone || existing.timezone, 
                partner_id !== undefined ? partner_id : existing.partner_id, 
                notes || existing.notes,
                status || existing.status,
                finalXiboId,
                orientation || existing.orientation,
                resolution || existing.resolution,
                license || existing.license,
                updateHardware.mac_address || null,
                updateHardware.client_address || null,
                updateHardware.brand || null,
                updateHardware.device_model || null,
                req.params.id
            ]
        );

        const screenService = require('../services/screen.service');
        try {
            await screenService.pushToXibo(req.params.id);
        } catch (e) {
            console.error('[Admin API] Xibo push failed during update:', e.message);
        }

        logActivity({ action: ACTION.UPDATE, module: MODULE.SCREEN, description: `Screen ID ${req.params.id} updated`, req });

        // Log partner change if it happened
        if (partner_id && partner_id != existing.partner_id) {
            const srv = new screenService();
            await srv.logEvent(req.params.id, 'partner_assigned', `Transferred to Partner ID: ${partner_id}`);
        }

        res.json({ success: true });
    } catch(err) { 
        res.status(500).json({ error: err.message }); 
    }
});

router.post('/screens/:id/sync-location', hasPermission('screen:manage'), async (req, res) => {
    try {
        const screen = await dbGet('SELECT xibo_display_id FROM screens WHERE id = ?', [req.params.id]);
        if (!screen || !screen.xibo_display_id) {
            return res.status(404).json({ error: 'Screen not linked to Xibo player' });
        }
        
        const screenService = require('../services/screen.service');
        await screenService.syncLocation(screen.xibo_display_id);
        
        const updated = await dbGet('SELECT latitude, longitude, address FROM screens WHERE id = ?', [req.params.id]);
        
        const srv = new screenService();
        await srv.logEvent(req.params.id, 'sync', `Location refreshed via GPS/IP. New address detected: ${updated.address || 'Unknown'}`);

        res.json({ success: true, location: updated });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** DELETE /api/admin/screens/:id - Delete screen from the local records. */
router.delete('/screens/:id', hasPermission('screen:manage'), async (req, res) => {
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
router.get('/screens/:id/proof-of-play', hasPermission('screen:manage'), async (req, res) => {
    try {
        const screen = await dbGet('SELECT * FROM screens WHERE id = ?', [req.params.id]);
        if (!screen || !screen.xibo_display_id) return res.json([]);

        const statsService = require('../services/stats.service');
        const logs = await statsService.getRecentStats();
        const filtered = logs.data.filter(l => String(l.displayId) === String(screen.xibo_display_id));
        res.json(filtered);
    } catch(err) { res.status(500).json([]); }
});

/** GET /api/admin/screens/:id/sync-status */
router.get('/screens/:id/sync-status', hasPermission('screen:manage'), async (req, res) => {
    try {
        const screen = await dbGet('SELECT xibo_display_id, status, updated_at FROM screens WHERE id = ?', [req.params.id]);
        if (!screen || !screen.xibo_display_id) {
            return res.status(404).json({ error: 'Screen not found or not linked' });
        }

        const bufferService = require('../services/buffer.service');
        const pendingCount = await dbGet('SELECT COUNT(*) as count FROM stat_buffer WHERE display_id = ? AND synced = 0', [screen.xibo_display_id]);
        const lastWindow = await dbGet('SELECT * FROM offline_windows WHERE display_id = ? ORDER BY id DESC LIMIT 1', [screen.xibo_display_id]);

        res.json({
            displayId: screen.xibo_display_id,
            status: screen.status,
            pendingStats: pendingCount ? pendingCount.count : 0,
            lastOfflineWindow: lastWindow || null,
            lastSyncAttempt: screen.updated_at
        });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/admin/screens/:id/offline-history */
router.get('/screens/:id/offline-history', hasPermission('screen:manage'), async (req, res) => {
    try {
        const screen = await dbGet('SELECT xibo_display_id FROM screens WHERE id = ?', [req.params.id]);
        if (!screen || !screen.xibo_display_id) {
            return res.status(404).json({ error: 'Screen not found or not linked' });
        }

        const history = await dbAll('SELECT * FROM offline_windows WHERE display_id = ? ORDER BY id DESC LIMIT 30', [screen.xibo_display_id]);
        res.json(history);
    } catch(err) { res.status(500).json({ error: err.message }); }
});


/** GET /api/admin/screens/:id/logs */
router.get('/screens/:id/logs', hasPermission('audit:view'), async (req, res) => {
    try {
        const logs = await dbAll(
            'SELECT * FROM screen_event_logs WHERE screen_id = ? ORDER BY created_at DESC LIMIT 100',
            [req.params.id]
        );
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PARTNERS ───

/** GET /api/admin/partners - List all screen partners with screen counts and basic info. */
router.get('/partners', hasPermission('user:view'), async (req, res) => {
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
router.get('/partners/:id', hasPermission('user:view'), async (req, res) => {
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
router.post('/partners', hasPermission('user:edit'), async (req, res) => {
    const { name, company, email, phone, address, city, password } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({ error: 'Partner name and email are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    // Clean empty fields from customFields array
    const cleanedCustomFields = Array.isArray(req.body.customFields) 
        ? req.body.customFields.filter(f => f && f.key && f.key.trim() !== '') 
        : [];

    try {
        const existing = await dbGet('SELECT id FROM partners WHERE email = ?', [email]);
        if (existing) return res.status(409).json({ error: 'Email already exists' });

        const result = await dbRun(
            `INSERT INTO partners (name, company, email, phone, address, city, status, revenue_share_percentage, custom_fields) 
             VALUES (?, ?, ?, ?, ?, ?, 'Active', 50, ?)`,
            [name, company, email, phone, address, city, JSON.stringify(cleanedCustomFields)]
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
router.patch('/partners/:id/approve', hasPermission('user:edit'), async (req, res) => {
    try {
        const result = await dbRun('UPDATE partners SET status = "Active" WHERE id = ?', [req.params.id]);
        logActivity({ action: ACTION.APPROVE, module: MODULE.PARTNER, description: `Partner ID ${req.params.id} approved/activated`, req });
        res.json({ success: true, partner_id: req.params.id, status: 'Active' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PATCH /api/admin/partners/:id/disable - Disable a partner. */
router.patch('/partners/:id/disable', hasPermission('user:edit'), async (req, res) => {
    try {
        const result = await dbRun('UPDATE partners SET status = "Disabled" WHERE id = ?', [req.params.id]);
        logActivity({ action: ACTION.UPDATE, module: MODULE.PARTNER, description: `Partner ID ${req.params.id} disabled`, req });
        res.json({ success: true, partner_id: req.params.id, status: 'Disabled' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/admin/partners/payouts/pending - List all pending payout requests for review. */
router.get('/partners/payouts/pending', hasPermission('audit:view'), async (req, res) => {
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
router.post('/partners/payouts/:id/approve', hasPermission('user:edit'), async (req, res) => {
    try {
        const result = await dbRun('UPDATE partner_payouts SET status = "Paid" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Payout request not found' });
        res.json({ success: true, payout_id: req.params.id, status: 'Paid' });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

/** PUT /api/admin/partners/:id - Update partner profile. */
router.put('/partners/:id', hasPermission('user:edit'), async (req, res) => {
    const { name, company, email, phone, address, city, status, revenue_share_percentage, password, customFields } = req.body;
    
    // Clean empty fields from customFields array
    const cleanedCustomFields = Array.isArray(customFields) 
        ? customFields.filter(f => f && f.key && f.key.trim() !== '') 
        : [];

    try {
        await dbRun(
            `UPDATE partners SET name=?, company=?, email=?, phone=?, address=?, city=?, status=?, revenue_share_percentage=?, custom_fields=? WHERE id=?`,
            [name, company, email, phone, address, city, status, revenue_share_percentage, JSON.stringify(cleanedCustomFields), req.params.id]
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
router.delete('/partners/:id', hasPermission('user:edit'), async (req, res) => {
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
router.post('/partners/:id/assign-screens', hasPermission('user:edit'), async (req, res) => {
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







// ─── INVOICES / BILLING ───

/** GET /api/admin/invoices - List all billing records. */
router.get('/invoices', hasPermission('audit:view'), async (req, res) => {
    // TODO: Enable in v2.0
    return res.status(503).json({ error: 'Billing feature is temporarily unavailable.' });
});

/** POST /api/admin/invoices - Create a manual invoice for a brand. */
router.post('/invoices', hasPermission('audit:view'), async (req, res) => {
    // TODO: Enable in v2.0
    return res.status(503).json({ error: 'Billing feature is temporarily unavailable.' });
});

// ─── CAMPAIGNS (Real from Xibo CMS) ───

/** GET /api/admin/campaigns/recent - Fetch live campaign data from Xibo. */
router.get('/campaigns/recent', hasPermission('creative:moderate'), async (req, res) => {
    try {
        const [campaigns, mediaBrands, brands] = await Promise.all([
            xiboService.getCampaigns(),
            dbAll('SELECT mediaId, brand_id FROM media_brands'),
            dbAll('SELECT id, name FROM brands')
        ]);

        const enhanced = campaigns.map(c => {
            // Find a mediaId linked to this campaign layout/widget (simplification)
            // In Xibo, campaigns are often linked to layouts.
            // For now, we'll try to find a mapping based on name or ID if possible.
            // If the campaign name contains a media ID hint like "Ad_123", we use that.
            let brandName = 'Unassigned';
            
            // Try to find any media_brands mapping for this campaign's layouts
            // (Assuming campaign name might match creative_name in slots for now)
            
            return {
                id: c.campaignId,
                name: c.campaign,
                brandName,
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
router.get('/inventory', hasPermission('creative:view'), async (req, res) => {
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
router.post('/slots/assign', hasPermission('screen:manage'), async (req, res) => {
    const { displayId, slot_number, brand_id, start_date, end_date, creative_name, subscription_id, mediaId } = req.body;

    // --- Subscription Validation (only when assigning to a brand) ---
    if (brand_id) {
        // 1. Active subscription gate
        const today = new Date().toISOString().slice(0, 10);
        // 1. Validate the specific subscription (if provided) or find the best active one
        const sub = subscription_id
            ? await dbGet('SELECT * FROM subscriptions WHERE id = ? AND brand_id = ? AND status = "Active" AND start_date <= NOW() AND end_date >= NOW()', [subscription_id, brand_id])
            : await dbGet(
                `SELECT * FROM subscriptions WHERE brand_id = ? AND status = 'Active' AND start_date <= NOW() AND end_date >= NOW() ORDER BY id DESC LIMIT 1`,
                [brand_id]
              );

        if (!sub) {
            return res.status(403).json({ error: 'Brand does not have an active subscription for this period. Activate a subscription before assigning slots.' });
        }

        // 2. Count total allowed across ALL active subscriptions
        const activeSubs = await dbAll(
            `SELECT SUM(screens_included) as allowed_screens, SUM(slots_included) as allowed_slots 
             FROM subscriptions 
             WHERE brand_id = ? AND status = 'Active' AND start_date <= NOW() AND end_date >= NOW()`,
            [brand_id]
        );
        const totalAllowedScreens = activeSubs[0].allowed_screens || 0;
        const totalAllowedSlots = activeSubs[0].allowed_slots || 0;

        // 3. Screen scope check
        const usedScreensRow = await dbGet('SELECT COUNT(DISTINCT displayId) as cnt FROM slots WHERE brand_id = ?', [brand_id]);
        const currentScreenCount = usedScreensRow ? usedScreensRow.cnt : 0;
        const alreadyOnThisScreen = await dbGet('SELECT id FROM slots WHERE brand_id = ? AND displayId = ? LIMIT 1', [brand_id, displayId]);
        
        if (!alreadyOnThisScreen && (currentScreenCount + 1) > totalAllowedScreens) {
            return res.status(403).json({ 
                error: "screen_limit_reached", 
                used: currentScreenCount, 
                allowed: totalAllowedScreens 
            });
        }

        // 4. Slot scope check
        const usedSlotsRow = await dbGet('SELECT COUNT(*) as cnt FROM slots WHERE brand_id = ? AND NOT (displayId = ? AND slot_number = ?)', [brand_id, displayId, slot_number]);
        const usedSlots = usedSlotsRow ? usedSlotsRow.cnt : 0;
        if (usedSlots + 1 > totalAllowedSlots) {
            return res.status(403).json({ 
                error: "slot_limit_reached", 
                used: usedSlots, 
                allowed: totalAllowedSlots 
            });
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
router.post('/slots/sync-brands', hasPermission('creative:edit'), async (req, res) => {
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
router.get('/slots/screen/:displayId', hasPermission('screen:manage'), async (req, res) => {
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
router.get('/payouts', hasPermission('audit:view'), async (req, res) => {
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
router.get('/billing/summary', hasPermission('audit:view'), async (req, res) => {
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
router.post('/billing/generate-monthly', hasPermission('user:edit'), async (req, res) => {
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
router.get('/reports/financials', hasPermission('audit:view'), async (req, res) => {
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
router.patch('/payouts/:id/approve', hasPermission('user:edit'), async (req, res) => {

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
router.get('/network/health', hasPermission('audit:view'), async (req, res) => {
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
router.patch('/creatives/:id/approve', hasPermission('creative:moderate'), async (req, res) => {
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
router.patch('/creatives/:id/reject', hasPermission('creative:moderate'), async (req, res) => {
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
router.delete('/creatives/:id', hasPermission('creative:edit'), async (req, res) => {
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
router.post('/partners/:id/xibo/connect', hasPermission('user:edit'), async (req, res) => {
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
router.get('/partners/:id/xibo/status', hasPermission('user:view'), async (req, res) => {
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
router.post('/partners/:id/xibo/reprovision', hasPermission('user:edit'), async (req, res) => {
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
router.delete('/partners/:id/xibo/disconnect', hasPermission('user:edit'), async (req, res) => {
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
router.get('/partners/:id/xibo/resources', hasPermission('user:view'), async (req, res) => {
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
router.get('/xibo/discover', hasPermission('screen:manage'), async (req, res) => {
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
router.get('/xibo/config', hasPermission('audit:view'), (req, res) => {
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
router.get('/activity-logs/stats', hasPermission('audit:view'), async (req, res) => {
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








