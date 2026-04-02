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
        const [partner, screens] = await Promise.all([
            dbGet('SELECT * FROM partners WHERE id = ?', [partnerId]),
            getPartnerScreens(partnerId)
        ]);
        
        const enriched = await enrichScreensWithXibo(screens);
        const displayIds = screens.map(s => s.xibo_display_id).filter(Boolean);

        if (displayIds.length === 0) {
            return res.json({
                partner: { name: partner?.name, company: partner?.company, email: partner?.email, revenue_share_percentage: partner?.revenue_share_percentage || 50 },
                totalScreens: 0, onlineScreens: 0, offlineScreens: 0,
                totalSlots: 0, occupiedSlots: 0, emptySlots: 0, utilizationRate: 0,
                currentRevenue: 0, pendingPayments: 0, earningsByBrand: [], recentPoP: []
            });
        }

        const ph = displayIds.map(() => '?').join(',');

        // 2. Parallelize aggregate queries
        const [assignedSlotsRow, revenue, pendingPayments, earningsByBrand, recentStats] = await Promise.all([
            dbGet(`SELECT COUNT(*) as count FROM slots WHERE displayId IN (${ph}) AND brand_id IS NOT NULL`, displayIds).catch(() => ({ count: 0 })),
            dbGet(`SELECT SUM(i.amount) as total FROM invoices i JOIN slots sl ON sl.brand_id = i.brand_id WHERE sl.displayId IN (${ph}) AND i.status = 'Paid'`, displayIds).catch(() => ({ total: 0 })),
            dbGet(`SELECT SUM(i.amount) as total FROM invoices i JOIN slots sl ON sl.brand_id = i.brand_id WHERE sl.displayId IN (${ph}) AND i.status = 'Pending'`, displayIds).catch(() => ({ total: 0 })),
            dbAll(`SELECT b.name as brand_name, COUNT(DISTINCT sl.displayId) as screen_count, SUM(i.amount) as earnings FROM slots sl JOIN brands b ON sl.brand_id = b.id LEFT JOIN invoices i ON i.brand_id = sl.brand_id AND i.status = 'Paid' WHERE sl.displayId IN (${ph}) AND sl.brand_id IS NOT NULL GROUP BY sl.brand_id ORDER BY earnings DESC`, displayIds).catch(() => []),
            require('../services/stats.service').getRecentStats().catch(() => ({ data: [] }))
        ]);

        const totalScreens = enriched.length;
        const onlineScreens = enriched.filter(s => s.liveStatus === 'Online').length;
        const offlineScreens = enriched.filter(s => s.liveStatus === 'Offline').length;
        const totalSlots = displayIds.length * 20;
        const occupiedSlots = assignedSlotsRow?.count || 0;
        const emptySlots = Math.max(0, totalSlots - occupiedSlots);
        const utilizationRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

        const recentPoP = (recentStats.data || [])
            .filter(r => displayIds.includes(r.displayId))
            .sort((a, b) => new Date(b.playedAt || 0) - new Date(a.playedAt || 0))
            .slice(0, 10);

        res.json({
            partner: { name: partner?.name, company: partner?.company, email: partner?.email, revenue_share_percentage: partner?.revenue_share_percentage || 50 },
            totalScreens, onlineScreens, offlineScreens,
            totalSlots, occupiedSlots, emptySlots, utilizationRate,
            currentRevenue: revenue?.total || 0,
            pendingPayments: pendingPayments?.total || 0,
            earningsByBrand,
            recentPoP
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
    try {
        const partnerId = req.user.partner_id;
        if (!partnerId) return res.status(400).json({ error: 'No partner assigned.' });

        const screens = await getPartnerScreens(partnerId);
        const displayIds = screens.map(s => s.xibo_display_id).filter(Boolean);
        if (displayIds.length === 0) return res.json({ byBrand: [], summary: {} });

        const ph = displayIds.map(() => '?').join(',');
        const [byBrand, summary] = await Promise.all([
            dbAll(`SELECT b.name as brand_name, COUNT(DISTINCT sl.displayId) as screen_count, COALESCE(SUM(i.amount), 0) as earnings FROM slots sl JOIN brands b ON sl.brand_id = b.id LEFT JOIN invoices i ON i.brand_id = sl.brand_id AND i.status = 'Paid' WHERE sl.displayId IN (${ph}) AND sl.brand_id IS NOT NULL GROUP BY sl.brand_id ORDER BY earnings DESC`, displayIds).catch(() => []),
            dbGet(`SELECT COALESCE(SUM(CASE WHEN i.status='Paid' THEN i.amount ELSE 0 END), 0) as totalPaid, COALESCE(SUM(CASE WHEN i.status='Pending' THEN i.amount ELSE 0 END), 0) as totalPending FROM invoices i JOIN slots sl ON sl.brand_id = i.brand_id WHERE sl.displayId IN (${ph})`, displayIds).catch(() => ({ totalPaid: 0, totalPending: 0 }))
        ]);

        res.json({ byBrand, summary });
    } catch (err) { res.status(500).json({ error: err.message }); }
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
        const { screen_id, screen_name, issue } = req.body;
        if (!issue) return res.status(400).json({ error: 'Issue description is required.' });

        const result = await dbRun(
            'INSERT INTO support_tickets (partner_id, screen_id, screen_name, issue, status) VALUES (?, ?, ?, ?, ?)',
            [partnerId, screen_id || null, screen_name || '', issue, 'Open']
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
            dbGet('SELECT * FROM partners WHERE id = ?', [partnerId]),
            dbGet('SELECT id, username, role FROM users WHERE id = ?', [req.user.id])
        ]);
        res.json({ partner, user });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** PUT /api/partner/profile - Update partner contact profile. */
router.put('/profile', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        const { name, company, city, email, phone } = req.body;
        await dbRun('UPDATE partners SET name=?, company=?, city=?, email=?, phone=? WHERE id=?',
            [name, company, city, email, phone, partnerId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
