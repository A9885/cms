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
        const screenIds = screens.map(s => s.screen_id).filter(Boolean);
        const displayIds = screens.map(s => s.xibo_display_id).filter(Boolean);

        if (screenIds.length === 0) {
            return res.json({
                partner: { name: partner?.name, company: partner?.company, email: partner?.email, revenue_share_percentage: partner?.revenue_share_percentage || 50 },
                totalScreens: 0, onlineScreens: 0, offlineScreens: 0,
                totalSlots: 0, occupiedSlots: 0, utilizationRate: 0,
                currentRevenue: 0, pendingPayments: 0, recentPoP: []
            });
        }

        const screenPh = screenIds.map(() => '?').join(',');

        // 2. Aggregate queries based on campaigns
        const [activeCampaigns, revenueResult, statsResult, slotCounts, brandEarnings] = await Promise.all([
            dbGet(`SELECT COUNT(*) as count FROM campaigns WHERE screen_id IN (${screenPh}) AND status = 'Active'`, screenIds),
            dbGet(`
                SELECT 
                    SUM(CASE WHEN i.status = 'Paid' THEN i.amount ELSE 0 END) as paid,
                    SUM(CASE WHEN i.status = 'Pending' THEN i.amount ELSE 0 END) as pending
                FROM invoices i
                JOIN campaigns c ON i.brand_id = c.brand_id
                WHERE c.screen_id IN (${screenPh})
            `, screenIds),
            require('../services/stats.service').getRecentStats().catch(() => ({ data: [] })),
            dbGet(`SELECT COUNT(*) as count FROM slots WHERE displayId IN (${displayIds.map(() => '?').join(',')}) AND brand_id IS NOT NULL`, displayIds),
            dbAll(`
                SELECT b.name as brand_name, COUNT(DISTINCT c.screen_id) as screen_count, SUM(i.amount) as earnings
                FROM invoices i
                JOIN brands b ON i.brand_id = b.id
                JOIN campaigns c ON i.brand_id = c.brand_id
                WHERE c.screen_id IN (${screenPh})
                GROUP BY b.id
            `, screenIds)
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

        const [partner, screens] = await Promise.all([
            dbGet('SELECT * FROM partners WHERE id = ?', [partnerId]),
            getPartnerScreens(partnerId)
        ]);

        const screenIds = screens.map(s => s.screen_id).filter(Boolean);
        if (screenIds.length === 0) return res.json({ history: [], summary: {} });

        const screenPh = screenIds.map(() => '?').join(',');
        const query = `
            SELECT 
                DATE_FORMAT(i.created_at, '%Y-%m') as month,
                c.campaign_name,
                b.name as brand_name,
                i.amount as invoice_total,
                (i.amount * ?) as partner_share,
                i.status as payment_status
            FROM invoices i
            JOIN campaigns c ON i.brand_id = c.brand_id
            JOIN brands b ON i.brand_id = b.id
            WHERE c.screen_id IN (${screenPh})
            ORDER BY month DESC
        `;
        const share = (partner.revenue_share_percentage || 50) / 100;
        const history = await dbAll(query, [share, ...screenIds]);

        // Calculate summary
        const summary = history.reduce((acc, curr) => {
            if (curr.payment_status === 'Paid') acc.totalPaid += curr.partner_share;
            else acc.totalPending += curr.partner_share;
            return acc;
        }, { totalPaid: 0, totalPending: 0 });

        res.json({ history, summary });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PAYOUTS ──────────────────────────────────────────────────────────────────

/** GET /api/partner/payouts - List all payout history for the partner. */
router.get('/payouts', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        const payouts = await dbAll('SELECT * FROM partner_payouts WHERE partner_id = ? ORDER BY created_at DESC', [partnerId]);
        res.json(payouts);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/partner/payouts/request - Request payout for a specific month. */
router.post('/payouts/request', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        const { month, amount } = req.body;
        
        if (!month || !amount) return res.status(400).json({ error: 'Month and Amount required.' });

        // Simple duplicate check (preventing multiple requests for same month)
        const existing = await dbGet('SELECT id FROM partner_payouts WHERE partner_id=? AND month=? AND status="Pending"', [partnerId, month]);
        if (existing) return res.status(400).json({ error: 'A pending request already exists for this month.' });

        await dbRun('INSERT INTO partner_payouts (partner_id, month, amount, status) VALUES (?, ?, ?, "Pending")',
            [partnerId, month, amount]);

        res.json({ success: true, message: 'Payout request submitted.' });
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
