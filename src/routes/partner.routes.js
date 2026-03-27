const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/database');
const xiboService = require('../services/xibo.service');

// ─── HELPER: Get screens owned by this partner ──────────────────────────────
async function getPartnerScreens(partnerId) {
    return await dbAll(`
        SELECT s.*, p.name as partner_name, p.revenue_share_percentage
        FROM screens s
        LEFT JOIN partners p ON s.partner_id = p.id
        WHERE s.partner_id = ?
        ORDER BY s.id DESC
    `, [partnerId]);
}

// ─── HELPER: Get Xibo live status for an array of displayIds ─────────────────
async function enrichScreensWithXibo(screens) {
    let displays = [];
    try {
        displays = await xiboService.getDisplays();
    } catch (e) { /* If Xibo is unreachable, continue without status */ }

    return screens.map(s => {
        const xibo = displays.find(d => d.displayId === s.xibo_display_id);
        const isOnline = xibo ? (xibo.loggedIn === 1 || xibo.loggedIn === true) : false;
        const isLinked = !!s.xibo_display_id;
        return {
            ...s,
            isLinked,
            liveStatus: isLinked ? (isOnline ? 'Online' : 'Offline') : 'Not Linked',
            lastAccessed: xibo?.lastAccessed || null
        };
    });
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        if (!partnerId) return res.status(400).json({ error: 'No partner assigned to this user.' });

        const partner = await dbGet('SELECT * FROM partners WHERE id = ?', [partnerId]);
        const screens = await getPartnerScreens(partnerId);
        const enriched = await enrichScreensWithXibo(screens);

        const totalScreens = enriched.length;
        const onlineScreens = enriched.filter(s => s.liveStatus === 'Online').length;
        const offlineScreens = enriched.filter(s => s.liveStatus === 'Offline').length;
        const displayIds = screens.map(s => s.xibo_display_id).filter(Boolean);

        // Slot utilization across partner's screens
        const totalSlots = displayIds.length * 20;
        const assignedSlotsRow = await dbGet(
            `SELECT COUNT(*) as count FROM slots WHERE displayId IN (${displayIds.map(() => '?').join(',')}) AND brand_id IS NOT NULL`,
            displayIds
        ).catch(() => ({ count: 0 }));
        const occupiedSlots = displayIds.length > 0 ? (assignedSlotsRow?.count || 0) : 0;
        const emptySlots = Math.max(0, totalSlots - occupiedSlots);
        const utilizationRate = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

        // Revenue from paid invoices where the screen partner matches
        const revenue = await dbGet(`
            SELECT SUM(i.amount) as total 
            FROM invoices i
            JOIN slots sl ON sl.brand_id = i.brand_id
            WHERE sl.displayId IN (${displayIds.map(() => '?').join(',')}) AND i.status = 'Paid'
        `, displayIds).catch(() => ({ total: 0 }));

        const pendingPayments = await dbGet(`
            SELECT SUM(i.amount) as total 
            FROM invoices i
            JOIN slots sl ON sl.brand_id = i.brand_id
            WHERE sl.displayId IN (${displayIds.map(() => '?').join(',')}) AND i.status = 'Pending'
        `, displayIds).catch(() => ({ total: 0 }));

        // Earnings per brand (which brands are using this partner's screens)
        const earningsByBrand = displayIds.length > 0 ? await dbAll(`
            SELECT b.name as brand_name, COUNT(DISTINCT sl.displayId) as screen_count,
                   SUM(i.amount) as earnings
            FROM slots sl
            JOIN brands b ON sl.brand_id = b.id
            LEFT JOIN invoices i ON i.brand_id = sl.brand_id AND i.status = 'Paid'
            WHERE sl.displayId IN (${displayIds.map(() => '?').join(',')}) AND sl.brand_id IS NOT NULL
            GROUP BY sl.brand_id
            ORDER BY earnings DESC
        `, displayIds).catch(() => []) : [];

        // Recent Proof of Play
        let recentPoP = [];
        try {
            if (displayIds.length > 0) {
                const statsService = require('../services/stats.service');
                const recent = await statsService.getRecentStats();
                recentPoP = (recent.data || [])
                    .filter(r => displayIds.includes(r.displayId))
                    .sort((a, b) => new Date(b.playedAt || 0) - new Date(a.playedAt || 0))
                    .slice(0, 10);
            }
        } catch(e) { /* Stats optional */ }

        res.json({
            partner: { name: partner?.name, company: partner?.company, email: partner?.email, revenue_share_percentage: partner?.revenue_share_percentage || 50 },
            totalScreens,
            onlineScreens,
            offlineScreens,
            totalSlots,
            occupiedSlots,
            emptySlots,
            utilizationRate,
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
router.get('/screens', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        if (!partnerId) return res.status(400).json({ error: 'No partner assigned.' });

        const screens = await getPartnerScreens(partnerId);
        const enriched = await enrichScreensWithXibo(screens);
        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── EARNINGS ─────────────────────────────────────────────────────────────────
router.get('/earnings', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        if (!partnerId) return res.status(400).json({ error: 'No partner assigned.' });

        const screens = await getPartnerScreens(partnerId);
        const displayIds = screens.map(s => s.xibo_display_id).filter(Boolean);

        if (displayIds.length === 0) return res.json({ byBrand: [], invoices: [], summary: {} });

        const ph = displayIds.map(() => '?').join(',');

        const byBrand = await dbAll(`
            SELECT b.name as brand_name, COUNT(DISTINCT sl.displayId) as screen_count,
                   COALESCE(SUM(i.amount), 0) as earnings
            FROM slots sl
            JOIN brands b ON sl.brand_id = b.id
            LEFT JOIN invoices i ON i.brand_id = sl.brand_id AND i.status = 'Paid'
            WHERE sl.displayId IN (${ph}) AND sl.brand_id IS NOT NULL
            GROUP BY sl.brand_id
            ORDER BY earnings DESC
        `, displayIds).catch(() => []);

        const summary = await dbGet(`
            SELECT 
                COALESCE(SUM(CASE WHEN i.status='Paid' THEN i.amount ELSE 0 END), 0) as totalPaid,
                COALESCE(SUM(CASE WHEN i.status='Pending' THEN i.amount ELSE 0 END), 0) as totalPending
            FROM invoices i
            JOIN slots sl ON sl.brand_id = i.brand_id
            WHERE sl.displayId IN (${ph})
        `, displayIds).catch(() => ({ totalPaid: 0, totalPending: 0 }));

        res.json({ byBrand, summary });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── SLOT DETAILS for a specific screen ───────────────────────────────────────
router.get('/screens/:displayId/slots', async (req, res) => {
    try {
        const dbSlots = await dbAll(`
            SELECT sl.*, b.name as brand_name
            FROM slots sl
            LEFT JOIN brands b ON sl.brand_id = b.id
            WHERE sl.displayId = ?
        `, [req.params.displayId]);

        const slotMap = {};
        dbSlots.forEach(s => { slotMap[s.slot_number] = s; });

        const fullSlots = Array.from({ length: 20 }, (_, i) => {
            const n = i + 1;
            return slotMap[n] || { displayId: parseInt(req.params.displayId), slot_number: n, brand_id: null, brand_name: null, status: 'Available' };
        });

        res.json(fullSlots);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── SUPPORT TICKETS ──────────────────────────────────────────────────────────
router.get('/tickets', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        // Ensure table exists (lightweight DDL guard)
        await dbRun(`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                partner_id INTEGER,
                screen_id INTEGER,
                screen_name TEXT,
                issue TEXT NOT NULL,
                status TEXT DEFAULT 'Open',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).catch(() => {});
        const tickets = await dbAll('SELECT * FROM support_tickets WHERE partner_id = ? ORDER BY created_at DESC', [partnerId]);
        res.json(tickets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tickets', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        const { screen_id, screen_name, issue } = req.body;
        if (!issue) return res.status(400).json({ error: 'Issue description is required.' });

        await dbRun(`
            CREATE TABLE IF NOT EXISTS support_tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                partner_id INTEGER,
                screen_id INTEGER,
                screen_name TEXT,
                issue TEXT NOT NULL,
                status TEXT DEFAULT 'Open',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).catch(() => {});

        const result = await dbRun(
            'INSERT INTO support_tickets (partner_id, screen_id, screen_name, issue, status) VALUES (?, ?, ?, ?, ?)',
            [partnerId, screen_id || null, screen_name || '', issue, 'Open']
        );
        res.json({ success: true, id: result.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PROFILE ──────────────────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        const partner = await dbGet('SELECT * FROM partners WHERE id = ?', [partnerId]);
        const user = await dbGet('SELECT id, username, role FROM users WHERE id = ?', [req.user.id]);
        res.json({ partner, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/profile', async (req, res) => {
    try {
        const partnerId = req.user.partner_id;
        const { name, company, city, email, phone } = req.body;
        await dbRun('UPDATE partners SET name=?, company=?, city=?, email=?, phone=? WHERE id=?',
            [name, company, city, email, phone, partnerId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
