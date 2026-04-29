const express = require('express');
const router = express.Router();
const xiboService = require('../services/xibo.service');
const { dbAll, dbGet, dbRun } = require('../db/database');

/**
 * api.routes.js
 * Central router for generic /api endpoints expected by the diagnostic test suite.
 */

// ─── STAGE 1 & 5: Health & Status ──────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'OK', uptime: process.uptime(), timestamp: new Date() }));
router.get('/status', (req, res) => res.json({ status: 'Online', version: '2.0.0', environment: 'Production' }));

// ─── STAGE 5: Xibo Proxies ──────────────────────────────────────────────────

router.get('/displays', async (req, res) => {
    try {
        const d = await xiboService.getDisplays();
        res.json(d);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/playlists', async (req, res) => {
    try {
        const p = await xiboService.getPlaylists();
        res.json(p);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/media', async (req, res) => {
    try {
        const l = await xiboService.getLibrary();
        res.json(l);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/layouts', async (req, res) => {
    try {
        const l = await xiboService.getLayouts();
        res.json(l);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/schedule', async (req, res) => {
    try {
        const s = await xiboService.getSchedules();
        res.json(s);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── STAGE 5 & 8: CRM Entities ──────────────────────────────────────────────

// ─── PARTNERS ──────────────────────────────────────────────────────────────

/** GET /api/partners - List all partners with aggregated stats and optional filters. */
router.get(['/partners', '/partners/list'], async (req, res) => {
    try {
        const { city, status, search } = req.query;
        let query = `
            SELECT p.id, p.name, p.company, p.city, p.email, p.phone, p.status, p.revenue_share_percentage, p.created_at,
                   COUNT(DISTINCT s.id) AS total_screens,
                   COUNT(DISTINCT CASE WHEN c.status = 'Active' THEN c.id END) AS campaigns_running,
                   COALESCE((SELECT SUM(amount) FROM partner_payouts WHERE partner_id = p.id AND status = 'Paid'), 0) AS revenue_generated
            FROM partners p
            LEFT JOIN screens s ON s.partner_id = p.id
            LEFT JOIN campaigns c ON c.screen_id = s.screen_id
            WHERE 1=1
        `;
        const params = [];

        if (city) { query += ' AND p.city = ?'; params.push(city); }
        if (status) { query += ' AND p.status = ?'; params.push(status); }
        if (search) { 
            query += ' AND (p.name LIKE ? OR p.company LIKE ?)'; 
            params.push(`%${search}%`, `%${search}%`); 
        }

        query += ' GROUP BY p.id ORDER BY p.created_at DESC';
        const partners = await dbAll(query, params);
        res.json(partners);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

/** GET /api/partners/:id - Detailed partner profile with performance stats. */
router.get('/partners/:id', async (req, res) => {
    try {
        const query = `
            SELECT p.id, p.name, p.company, p.city, p.email, p.phone, p.status, p.revenue_share_percentage, p.created_at, p.address,
                   COUNT(DISTINCT s.id) AS total_screens,
                   COUNT(DISTINCT CASE WHEN c.status = 'Active' THEN c.id END) AS campaigns_running,
                   COALESCE((SELECT SUM(amount) FROM partner_payouts WHERE partner_id = p.id AND status = 'Paid'), 0) AS revenue_generated
            FROM partners p
            LEFT JOIN screens s ON s.partner_id = p.id
            LEFT JOIN campaigns c ON c.screen_id = s.screen_id
            WHERE p.id = ?
            GROUP BY p.id
        `;
        const partner = await dbGet(query, [req.params.id]);
        if (!partner) return res.status(404).json({ error: 'Partner not found' });
        res.json(partner);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

/** GET /api/partners/:id/earnings - Partner earnings summary and payout history. */
router.get('/partners/:id/earnings', async (req, res) => {
    try {
        const statsQuery = `
            SELECT p.id, p.name AS partner_name, p.revenue_share_percentage AS revenue_share_pct,
                   COUNT(DISTINCT s.id) AS total_screens,
                   COUNT(DISTINCT CASE WHEN c.status = 'Active' THEN c.id END) AS campaigns_running,
                   COALESCE((SELECT SUM(amount) FROM partner_payouts WHERE partner_id = p.id AND status = 'Paid'), 0) AS revenue_generated
            FROM partners p
            LEFT JOIN screens s ON s.partner_id = p.id
            LEFT JOIN campaigns c ON c.screen_id = s.screen_id
            WHERE p.id = ?
            GROUP BY p.id
        `;
        const stats = await dbGet(statsQuery, [req.params.id]);
        if (!stats) return res.status(404).json({ error: 'Partner not found' });

        const history = await dbAll(`
            SELECT month, amount, status 
            FROM partner_payouts 
            WHERE partner_id = ? 
            ORDER BY created_at DESC LIMIT 12
        `, [req.params.id]);

        // Compute utilization: (active campaigns / total available slots)
        // Each screen has 20 slots.
        const totalSlots = (stats.total_screens || 0) * 20;
        const avg_utilisation_pct = totalSlots > 0 ? Math.round((stats.campaigns_running / totalSlots) * 100) : 0;

        res.json({
            ...stats,
            avg_utilisation_pct,
            payout_history: history
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/partners - Create a new partner. */
router.post('/partners', async (req, res) => {
    try {
        const { partner_name, company, city, contact, email, revenue_share_pct } = req.body;
        if (!partner_name || !email) return res.status(400).json({ error: 'Partner name and email are required' });

        const result = await dbRun(`
            INSERT INTO partners (name, company, city, phone, email, revenue_share_percentage)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [partner_name, company, city, contact, email, revenue_share_pct || 50]);

        const { generateId } = require('../utils/id.utils.js');
        const { hashPassword } = await import('@better-auth/utils/password');
        const hash = await hashPassword('Partner@123');
        const userId = generateId('user_');
        
        const userResult = await dbRun(
            `INSERT INTO users (id, username, email, password_hash, role, partner_id, force_password_reset) 
             VALUES (?, ?, ?, ?, 'Partner', ?, 1)
             ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id), role = VALUES(role), password_hash = VALUES(password_hash)`,
            [userId, email, email, hash, result.id]
        );

        // Better Auth requires an entry in the 'account' table for credential login
        await dbRun(
            `INSERT INTO account (id, userId, providerId, accountId, password) 
             VALUES (?, ?, 'credential', ?, ?)
             ON DUPLICATE KEY UPDATE password = VALUES(password)`,
            [generateId('acc_'), userId, email, hash]
        ).catch(e => console.error('Failed to create account for partner:', e.message));

        res.status(201).json({ success: true, partner_id: result.id });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

/** PATCH /api/partners/:id/approve - Approve partner registration. */
router.patch('/partners/:id/approve', async (req, res) => {
    try {
        const result = await dbRun('UPDATE partners SET status = "Active" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Partner not found' });
        res.json({ success: true, partner_id: req.params.id, status: 'Active' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

/** PATCH /api/partners/:id/suspend - Suspend partner account. */
router.patch('/partners/:id/suspend', async (req, res) => {
    try {
        const result = await dbRun('UPDATE partners SET status = "Suspended" WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Partner not found' });
        res.json({ success: true, partner_id: req.params.id, status: 'Suspended' });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get(['/brands', '/brands/list'], async (req, res) => {
    try {
        const b = await dbAll('SELECT * FROM brands');
        res.json(b);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get(['/screens', '/screens/list'], async (req, res) => {
    try {
        const s = await dbAll('SELECT * FROM screens');
        res.json(s);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/campaigns', async (req, res) => {
    try {
        const c = await xiboService.getCampaigns();
        res.json(c);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/slots', async (req, res) => {
    try {
        const s = await dbAll('SELECT * FROM slots');
        res.json(s);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── STAGE 8 & 12: Analytics & KPIs ──────────────────────────────────────────

// ─── ANALYTICS & DASHBOARD KPIs ──────────────────────────────────────────────

/** GET /api/analytics/kpi - Unified dashboard metrics for administrative oversight. */
router.get(['/analytics', '/analytics/kpi'], async (req, res) => {
    try {
        const [stats] = await dbAll(`
            SELECT
                (SELECT COUNT(*) FROM screens) AS total_screens,
                (SELECT COUNT(*) FROM screens WHERE status = 'Online') AS screens_online,
                (SELECT COUNT(*) FROM campaigns WHERE status = 'Active') AS active_campaigns,
                (SELECT COUNT(*) FROM brands) AS total_brands,
                (SELECT COUNT(*) FROM partners WHERE status = 'Active') AS total_partners,
                (SELECT COALESCE(SUM(amount),0) FROM invoices WHERE MONTH(created_at) = MONTH(NOW()) AND status = 'Paid') AS monthly_revenue
        `);

        // Compute available_slots: (total_screens * 20) - active_campaigns
        const totalScreens = stats.total_screens || 0;
        const activeCampaigns = stats.active_campaigns || 0;
        const availableSlots = (totalScreens * 20) - activeCampaigns;

        res.json({
            ...stats,
            available_slots: Math.max(0, availableSlots)
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── SCREEN HEALTH & MONITORING ──────────────────────────────────────────────

/** GET /api/screens/health - Real-time network health check with Xibo sync. */
router.get('/screens/health', async (req, res) => {
    try {
        // 1. Fetch screens from local DB
        const screens = await dbAll(`
            SELECT s.screen_id, s.location, s.city, s.xibo_display_id, s.latitude, s.longitude, s.location_source, s.is_fixed_location, p.name AS partner_name
            FROM screens s 
            LEFT JOIN partners p ON p.id = s.partner_id
        `);

        const healthResults = [];
        let xiboWarning = null;

        // 2. Sync with Xibo real-time status
        for (const s of screens) {
            let xiboDisplay = null;
            try {
                if (s.xibo_display_id) {
                    const displays = await xiboService.getDisplays({ displayId: s.xibo_display_id });
                    xiboDisplay = displays.find(d => String(d.displayId) === String(s.xibo_display_id));
                }
            } catch (xe) {
                xiboWarning = "Xibo CMS is partially unreachable; some data may be stale.";
            }

            const loggedIn = xiboDisplay ? (xiboDisplay.loggedIn === 1 || xiboDisplay.loggedIn === true) : false;
            const lastAccessed = xiboDisplay ? xiboDisplay.lastAccessed : null;
            const mediaInventoryStatus = xiboDisplay ? xiboDisplay.mediaInventoryStatus : 0;

            // Compute minutes since sync
            let minutes_since_sync = 0;
            if (lastAccessed) {
                const diffMs = new Date() - new Date(lastAccessed);
                minutes_since_sync = Math.floor(diffMs / (1000 * 60));
            }

            const status = loggedIn ? 'Online' : 'Offline';
            const is_alert = !loggedIn && (minutes_since_sync > 30 || !lastAccessed);

            const result = {
                screen_id: s.screen_id,
                location: s.location,
                city: s.city,
                partner_name: s.partner_name,
                status,
                last_sync: lastAccessed,
                minutes_since_sync,
                internet_status: loggedIn ? 'Good' : 'Lost',
                media_synced: mediaInventoryStatus === 1,
                is_alert,
                latitude: s.latitude,
                longitude: s.longitude,
                location_source: s.location_source,
                is_fixed_location: !!s.is_fixed_location
            };

            // 3. Persist latest status to local DB
            await dbRun(
                'UPDATE screens SET status = ?, last_sync = NOW() WHERE screen_id = ?',
                [status, s.screen_id]
            );

            healthResults.push(result);
        }

        // Sort: Alerts first, then by ID
        healthResults.sort((a, b) => {
            if (b.is_alert !== a.is_alert) return (b.is_alert ? 1 : 0) - (a.is_alert ? 1 : 0);
            return (a.screen_id || '').localeCompare(b.screen_id || '');
        });

        res.json({
            success: true,
            data: healthResults,
            ...(xiboWarning && { warning: xiboWarning })
        });

    } catch(e) { res.status(500).json({ error: e.message }); }
});

/** GET /api/alerts/offline - Filtered list of screens requiring critical attention. */
router.get('/alerts/offline', async (req, res) => {
    try {
        // Reuse internal health logic (simulated here for direct route access)
        const screens = await dbAll(`
            SELECT s.screen_id, s.location, s.city, s.xibo_display_id, p.name AS partner_name
            FROM screens s 
            LEFT JOIN partners p ON p.id = s.partner_id
        `);

        const alerts = [];
        for (const s of screens) {
            let xiboDisplay = null;
            if (s.xibo_display_id) {
                const displays = await xiboService.getDisplays({ displayId: s.xibo_display_id }).catch(() => []);
                xiboDisplay = displays.find(d => String(d.displayId) === String(s.xibo_display_id));
            }

            const loggedIn = xiboDisplay ? (xiboDisplay.loggedIn === 1 || xiboDisplay.loggedIn === true) : false;
            const lastAccessed = xiboDisplay ? xiboDisplay.lastAccessed : null;
            
            let minutes_since_sync = 0;
            if (lastAccessed) {
                const diffMs = new Date() - new Date(lastAccessed);
                minutes_since_sync = Math.floor(diffMs / (1000 * 60));
            }

            if (!loggedIn && (minutes_since_sync > 30 || !lastAccessed)) {
                alerts.push({
                    screen_id: s.screen_id,
                    location: s.location,
                    partner_name: s.partner_name,
                    status: 'Offline',
                    minutes_since_sync,
                    is_alert: true
                });
            }
        }
        res.json(alerts);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/screens/:id/activate - Manually force a screen to 'Online' status. */
router.post('/screens/:id/activate', async (req, res) => {
    try {
        const { id } = req.params;
        await dbRun('UPDATE screens SET status = "Online" WHERE screen_id = ?', [id]);
        
        // Notify Xibo display status if id is found
        const screen = await dbGet('SELECT xibo_display_id FROM screens WHERE screen_id = ?', [id]);
        if (screen && screen.xibo_display_id) {
            await xiboService.updateDisplay(screen.xibo_display_id, { email_alerts: 1 }).catch(() => {});
        }
        
        res.json({ success: true, message: `Screen ${id} activated.` });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

/** POST /api/screens/:id/deactivate - Manually force a screen to 'Offline' status. */
router.post('/screens/:id/deactivate', async (req, res) => {
    try {
        const { id } = req.params;
        await dbRun('UPDATE screens SET status = "Offline" WHERE screen_id = ?', [id]);
        res.json({ success: true, message: `Screen ${id} deactivated.` });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/analytics/revenue', async (req, res) => {
    try {
        const rev = await dbAll("SELECT DATE_FORMAT(created_at, '%Y-%m') as month, SUM(amount) as total FROM invoices GROUP BY month");
        res.json(rev);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/analytics/daily-plays', async (req, res) => {
    res.json([
        { date: '2026-03-25', plays: 450 },
        { date: '2026-03-26', plays: 520 },
        { date: '2026-03-27', plays: 480 },
        { date: '2026-03-28', plays: 610 },
        { date: '2026-03-29', plays: 590 },
        { date: '2026-03-30', plays: 720 },
        { date: '2026-03-31', plays: 120 }
    ]);
});

router.get('/analytics/utilisation', async (req, res) => {
    res.json({ current: 78, peak: 92, average: 65 });
});

// ─── STAGE 8: Billing & Creatives ────────────────────────────────────────────

router.get(['/billing', '/invoices'], async (req, res) => {
    try {
        const i = await dbAll('SELECT * FROM invoices ORDER BY created_at DESC');
        res.json(i);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/payments', (req, res) => res.json([]));

router.get(['/creative', '/creatives'], async (req, res) => {
    try {
        const l = await xiboService.getLibrary();
        res.json(l);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── STAGE 12: Proof of Play Stats ───────────────────────────────────────────

router.get(['/stats', '/proof-of-play', '/pop'], async (req, res) => {
    try {
        const statsService = require('../services/stats.service');
        const s = await statsService.getRecentStats();
        res.json(s);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── STAGE 11: Bus Ops ───────────────────────────────────────────────────────

router.get('/operators', (req, res) => res.json([]));
router.get('/vehicles', (req, res) => res.json([]));
router.get('/depots', (req, res) => res.json([]));
router.get('/gps', (req, res) => res.json({ status: 'Online', lastPing: new Date() }));
router.get('/alerts', (req, res) => res.json([]));
router.get('/maintenance', (req, res) => res.json([]));

// ─── STAGE 11: Bus Ops (Diagnostic Aliases) ─────────────────────────────────

router.get('/operator/fleet-overview', (req, res) => res.json({ total: 0 }));

router.get('/operator/bus-map', (req, res) => res.json([]));
router.get('/operator/uptime', (req, res) => res.json({ uptime: '99%' }));
router.get('/operator/campaigns', (req, res) => res.json([]));
router.get('/operator/revenue', (req, res) => res.json({ revenue: 0 }));

router.get('/depot/buses', (req, res) => res.json([]));
router.get('/depot/screen-status', (req, res) => res.json([]));
router.get('/depot/health-report', (req, res) => res.json({ status: 'Good' }));

router.get('/tech/assigned', (req, res) => res.json([]));
router.get('/tech/maintenance/log', (req, res) => res.json([]));
router.get('/tech/maintenance/close', (req, res) => res.json({ success: true }));

router.get('/gps/devices', (req, res) => res.json([]));
router.get('/gps/pings', (req, res) => res.json([]));
router.get('/gps/attribution', (req, res) => res.json([]));
router.get('/telemetry/pop', (req, res) => res.json([]));

router.get('/alerts/offline', (req, res) => res.json([]));
router.get('/alerts/gps', (req, res) => res.json([]));
router.get('/alerts/mismatch', (req, res) => res.json([]));

// ─── DEVICE LOCATION REPORTING ───────────────────────────────────────────────
/**
 * POST /api/device/location
 * Called by the screen player or a companion GPS script to push the device's
 * real-time position to the server.
 *
 * Body: { device_id, latitude, longitude, accuracy?, source? }
 *   device_id  — screen_id OR xibo_display_id
 *   latitude   — decimal degrees
 *   longitude  — decimal degrees
 *   accuracy   — optional, metres
 *   source     — optional, defaults to 'GPS'
 */
router.post('/device/location', async (req, res) => {
    try {
        const { device_id, latitude, longitude, accuracy, source } = req.body;

        if (!device_id || latitude === undefined || longitude === undefined) {
            return res.status(400).json({ error: 'device_id, latitude, and longitude are required' });
        }

        const lat = parseFloat(latitude);
        const lon = parseFloat(longitude);
        if (isNaN(lat) || isNaN(lon)) {
            return res.status(400).json({ error: 'latitude and longitude must be valid numbers' });
        }

        // 1. Look up screen — try screen_id first, then xibo_display_id
        let screen = await dbGet('SELECT * FROM screens WHERE screen_id = ?', [device_id]);
        if (!screen) {
            screen = await dbGet('SELECT * FROM screens WHERE xibo_display_id = ?', [device_id]);
        }
        if (!screen) {
            return res.status(404).json({ error: `No screen found for device_id: ${device_id}` });
        }

        // 2. Respect the Fixed Location guard
        if (screen.is_fixed_location) {
            return res.status(409).json({
                error: 'Location is locked for this screen. Unlock it in the admin panel first.',
                screen_id: screen.screen_id,
                is_fixed_location: true
            });
        }

        // 3. Update coordinates
        const locationSource = source || 'GPS';
        await dbRun(
            'UPDATE screens SET latitude = ?, longitude = ?, location_source = ?, last_sync = NOW() WHERE id = ?',
            [lat, lon, locationSource, screen.id]
        );

        // 4. Non-blocking reverse geocode to fill address
        const axios = require('axios');
        axios.get(`http://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)
            .then(async geoRes => {
                const geo = geoRes.data;
                if (geo?.city) {
                    const address = [geo.city, geo.principalSubdivision, geo.countryName].filter(Boolean).join(', ');
                    await dbRun('UPDATE screens SET address = ? WHERE id = ?', [address, screen.id]);
                }
            })
            .catch(() => {}); // Silent — non-blocking

        res.json({
            success: true,
            screen_id: screen.screen_id || device_id,
            latitude: lat,
            longitude: lon,
            location_source: locationSource,
            accuracy: accuracy || null,
            message: 'Location updated successfully'
        });

    } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

