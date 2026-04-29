const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/database');
const xiboService = require('../services/xibo.service');

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Fetch all screens assigned to a specific partner.
 * @param {number|string} partnerId
 * @returns {Promise<Array>}
 */
async function getPartnerScreens(partnerId) {
    return await dbAll(`
        SELECT s.*, p.name as partner_name, p.revenue_share_percentage
        FROM screens s
        LEFT JOIN partners p ON s.partner_id = p.id
        WHERE s.partner_id = ?
        ORDER BY s.id DESC
    `, [partnerId]);
}
/**
 * Enrich local screen records with real-time status and metadata from Xibo.
 * Delegates to ScreenService.
 * @param {Array} screens 
 */
async function enrichScreensWithXibo(screens) {
    const screenService = require('../services/screen.service');
    return await screenService.enrichWithXibo(screens);
}


// ─── DASHBOARD ────────────────────────────────────────────────────────────────

/**
 * GET /api/partner/dashboard
 * Returns performance metrics for the logged-in partner's screen portfolio.
 * Includes utilization, revenue summaries, and recent playback history.
 */
router.get('/dashboard', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        if (!partnerId) return res.status(400).json({ error: 'No partner assigned to this user.' });

        // 1. Parallelize initial data fetching
        const [partner, screens, openTickets] = await Promise.all([
            dbGet('SELECT * FROM partners WHERE id = ?', [partnerId]),
            getPartnerScreens(partnerId),
            dbGet('SELECT COUNT(*) as count FROM support_tickets WHERE partner_id = ? AND status != "Resolved"', [partnerId])
        ]);
        
        const enriched = await enrichScreensWithXibo(screens);
        const screenIds = screens.map(s => s.screen_id).filter(Boolean);
        const displayIds = screens.map(s => s.xibo_display_id).filter(Boolean);

        const screenPh = screenIds.length > 0 ? screenIds.map(() => '?').join(',') : '\"-1\"'; 

        // 2. Aggregate queries based on campaigns
        const [activeCampaigns, revenueResult, statsResult, slotCounts, brandEarnings] = await Promise.all([
            dbGet(`SELECT COUNT(*) as count FROM campaigns WHERE screen_id IN (${screenPh}) AND status = 'Active'`, screenIds.length > 0 ? screenIds : ['-1']),
            dbGet(`
                SELECT 
                    SUM(CASE WHEN i.status = 'Paid' THEN i.amount ELSE 0 END) as paid,
                    SUM(CASE WHEN i.status = 'Pending' THEN i.amount ELSE 0 END) as pending
                FROM invoices i
                JOIN campaigns c ON i.brand_id = c.brand_id
                WHERE c.screen_id IN (${screenPh})
            `, screenIds.length > 0 ? screenIds : ['-1']),
            require('../services/stats.service').getRecentStats().catch(() => ({ data: [] })),
            displayIds.length > 0 
                ? dbGet(`SELECT COUNT(*) as count FROM slots WHERE displayId IN (${displayIds.map(() => '?').join(',')}) AND mediaId IS NOT NULL`, displayIds)
                : Promise.resolve({ count: 0 }),
            dbAll(`
                SELECT b.name as brand_name, COUNT(DISTINCT c.screen_id) as screen_count, SUM(i.amount) as earnings
                FROM invoices i
                JOIN brands b ON i.brand_id = b.id
                JOIN campaigns c ON i.brand_id = c.brand_id
                WHERE c.screen_id IN (${screenPh})
                GROUP BY b.id
            `, screenIds.length > 0 ? screenIds : ['-1'])
        ]);

        const totalScreens = enriched.length;
        const onlineScreens = enriched.filter(s => s.liveStatus === 'Online').length;
        const offlineScreens = enriched.filter(s => s.liveStatus === 'Offline').length;
        
        const totalSlots = totalScreens * 20;
        const occupiedSlots = slotCounts?.count || 0;
        const emptySlots = Math.max(0, totalSlots - occupiedSlots);
        const utilizationRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

        // Apply partner revenue share
        const share = (partner.revenue_share_percentage || 50) / 100;
        const currentRevenue = (revenueResult?.paid || 0) * share;
        const pendingPayments = (revenueResult?.pending || 0) * share;

        const recentPoP = (statsResult.data || [])
            .filter(r => displayIds.includes(String(r.displayId)) || displayIds.includes(Number(r.displayId)))
            .map(r => {
                let playedAt = r.playedAt;
                try {
                    // Normalize to ISO if not already
                    playedAt = new Date(r.playedAt).toISOString();
                } catch (e) {
                    playedAt = r.playedAt || new Date().toISOString();
                }
                return { ...r, playedAt };
            })
            .sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt))
            .slice(0, 10);

        res.json({
            partner: { 
                name: partner?.name, 
                company: partner?.company, 
                email: partner?.email, 
                revenue_share_percentage: partner.revenue_share_percentage 
            },
            totalScreens, 
            onlineScreens, 
            offlineScreens,
            totalSlots,
            occupiedSlots,
            emptySlots,
            activeCampaigns: activeCampaigns?.count || 0,
            utilizationRate,
            currentRevenue,
            pendingPayments,
            earningsByBrand: brandEarnings || [],
            recentPoP,
            openTickets: openTickets?.count || 0,
            syncing: statsResult.syncing || false
        });
    } catch (err) {
        console.error('[Partner API] Dashboard Error:', err);
        res.status(500).json({ error: err.message });
    }
});


// ─── MY SCREENS ───────────────────────────────────────────────────────────────

/** GET /api/partner/screens - List all screens belonging to this partner with live status. */
router.get('/screens', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        if (!partnerId) return res.status(400).json({ error: 'No partner assigned.' });
        const screens = await getPartnerScreens(partnerId);
        const enriched = await enrichScreensWithXibo(screens);
        res.json(enriched);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── EARNINGS ─────────────────────────────────────────────────────────────────

/**
 * GET /api/partner/earnings
 * Returns a detailed breakdown of revenue generated by the partner's screens.
 */
router.get('/earnings', async (req, res) => {
    // TODO: Enable in v2.0
    return res.status(503).json({ error: 'Billing feature is temporarily unavailable.' });
});

// ─── PAYOUTS ──────────────────────────────────────────────────────────────────

/** GET /api/partner/payouts - List all payout history for the partner. */
router.get('/payouts', async (req, res) => {
    // TODO: Enable in v2.0
    return res.status(503).json({ error: 'Billing feature is temporarily unavailable.' });
});

/** POST /api/partner/payouts/request - Request payout for a specific month. */
router.post('/payouts/request', async (req, res) => {
    // TODO: Enable in v2.0
    return res.status(503).json({ error: 'Billing feature is temporarily unavailable.' });
});


// ─── SLOT DETAILS ─────────────────────────────────────────────────────────────

/** GET /api/partner/screens/:displayId/slots - Get the 20-slot map for a specific screen. */
router.get('/screens/:displayId/slots', async (req, res) => {
    try {
        const dbSlots = await dbAll(`SELECT sl.*, b.name as brand_name FROM slots sl LEFT JOIN brands b ON sl.brand_id = b.id WHERE sl.displayId = ?`, [req.params.displayId]);
        const slotMap = {};
        dbSlots.forEach(s => { slotMap[s.slot_number] = s; });

        const fullSlots = Array.from({ length: 20 }, (_, i) => {
            const n = i + 1;
            return slotMap[n] || { displayId: parseInt(req.params.displayId, 10), slot_number: n, brand_id: null, brand_name: null, status: 'Available' };
        });
        res.json(fullSlots);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/partner/screens/:displayId/sync - Force sync Xibo stats for a screen. */
router.post('/screens/:displayId/sync', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        if (!partnerId) return res.status(400).json({ error: 'No partner assigned.' });
        
        // Verify screen is assigned to this partner
        const screen = await dbGet('SELECT * FROM screens WHERE xibo_display_id = ? AND partner_id = ?', [req.params.displayId, partnerId]);
        if (!screen) return res.status(403).json({ error: 'Access denied. Screen not assigned to you.' });

        const statsService = require('../services/stats.service');
        const result = await statsService.forceSync(req.params.displayId);
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SUPPORT TICKETS ──────────────────────────────────────────────────────────

/** GET /api/partner/tickets - List support tickets reported by this partner. */
router.get('/tickets', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        const tickets = await dbAll('SELECT * FROM support_tickets WHERE partner_id = ? ORDER BY created_at DESC', [partnerId]);
        res.json(tickets);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/partner/tickets - Submit a new support ticket for a screen. */
router.post('/tickets', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        const { screen_id, screen_name, issue, category, priority } = req.body;
        if (!issue) return res.status(400).json({ error: 'Issue description is required.' });

        const result = await dbRun(
            'INSERT INTO support_tickets (partner_id, screen_id, screen_name, issue, category, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [partnerId, screen_id || null, screen_name || '', issue, category || 'General', priority || 'Medium', 'Open']
        );
        res.json({ success: true, id: result.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PROFILE ──────────────────────────────────────────────────────────────────

/** GET /api/partner/profile - Fetch partner profile and user account details. */
router.get('/profile', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        const [partner, user] = await Promise.all([
            dbGet('SELECT name, company, city, email, phone, address, custom_fields, revenue_share_percentage FROM partners WHERE id = ?', [partnerId]),
            dbGet('SELECT id, username, role FROM users WHERE id = ?', [req.user.id])
        ]);
        res.json({ partner, user });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


/** PUT /api/partner/profile - Update partner contact profile. */
router.put('/profile', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        const { name, company, city, email, phone, address } = req.body;
        await dbRun('UPDATE partners SET name=?, company=?, city=?, email=?, phone=?, address=? WHERE id=?',
            [name, company, city, email, phone, address, partnerId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});


// ─── XIBO SELF-SERVICE (PARTNER PORTAL) ──────────────────────────────────────

const provisioningService = require('../services/xibo-provisioning.service');

/**
 * POST /partnerportal/api/xibo/connect
 * Partner submits their own Xibo CMS credentials to auto-provision.
 * Body: { xibo_base_url, client_id, client_secret }
 */
router.post('/xibo/connect', async (req, res) => {
    const partnerId = req.user.partner_id;
    if (!partnerId) return res.status(400).json({ error: 'No partner profile found.' });

    const { xibo_base_url, client_id, client_secret } = req.body;
    if (!xibo_base_url || !client_id || !client_secret) {
        return res.status(400).json({ error: 'xibo_base_url, client_id, and client_secret are required.' });
    }

    try {
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

        res.json({ success: true, message: 'Credentials saved. Provisioning started.', status: 'provisioning' });

        // Background provisioning
        provisioningService.provisionPartner(partnerId).catch(err => {
            console.error(`[Partner Portal] Provisioning failed for partner ${partnerId}:`, err.message);
        });
    } catch (err) {
        console.error('[Partner Portal] Xibo connect error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /partnerportal/api/xibo/status
 * Poll provisioning progress. Used by the partner portal setup wizard.
 */
router.get('/xibo/status', async (req, res) => {
    const partnerId = req.user.partner_id;
    try {
        const cred = await dbGet(
            'SELECT provision_status, provision_error, provision_log, xibo_base_url, updated_at FROM partner_xibo_credentials WHERE partner_id = ?',
            [partnerId]
        );

        if (!cred) return res.json({ connected: false, status: 'not_configured' });

        let steps = [];
        try { steps = JSON.parse(cred.provision_log || '{}')?.steps || []; } catch(e) {}

        // Only expose sanitised step info (no secrets)
        const sanitisedSteps = steps.map(s => ({
            step: s.step,
            status: s.status,
            detail: s.detail,
            ts: s.ts
        }));

        res.json({
            connected: true,
            status: cred.provision_status,
            error: cred.provision_error || null,
            xibo_base_url: cred.xibo_base_url,
            steps: sanitisedSteps,
            updatedAt: cred.updated_at
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /partnerportal/api/xibo/resources
 * Returns all provisioned Xibo resource IDs for the logged-in partner.
 */
router.get('/xibo/resources', async (req, res) => {
    const partnerId = req.user.partner_id;
    try {
        const resources = await dbAll(
            'SELECT resource_type, xibo_resource_id, xibo_resource_name, created_at FROM partner_xibo_resources WHERE partner_id = ? ORDER BY id ASC',
            [partnerId]
        );
        res.json(resources.map(r => ({
            type: r.resource_type,
            xibo_id: r.xibo_resource_id,
            name: r.xibo_resource_name,
            createdAt: r.created_at
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});


module.exports = router;

