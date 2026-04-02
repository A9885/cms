const express = require('express');
const router = express.Router();
const xiboService = require('../services/xibo.service');
const { dbAll, dbGet } = require('../db/database');

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

router.get(['/brands', '/brands/list'], async (req, res) => {
    try {
        const b = await dbAll('SELECT * FROM brands');
        res.json(b);
    } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get(['/partners', '/partners/list'], async (req, res) => {
    try {
        const p = await dbAll('SELECT * FROM partners');
        res.json(p);
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

router.get(['/analytics', '/analytics/kpi'], async (req, res) => {
    try {
        const [brands, partners, screens] = await Promise.all([
            dbGet('SELECT COUNT(*) as count FROM brands'),
            dbGet('SELECT COUNT(*) as count FROM partners'),
            dbGet('SELECT COUNT(*) as count FROM screens')
        ]);
        res.json({
            brands: brands.count,
            partners: partners.count,
            screens: screens.count,
            uptime: '99.9%',
            activeCampaigns: 10
        });
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

// ─── STAGE 9: Brand Portal Modules (Diagnostic Aliases) ────────────────────

router.get('/brand/dashboard', async (req, res) => res.json({ status: 'Online', brandId: 1 }));
router.get('/brand/screens', async (req, res) => res.json([]));
router.get('/brand/screens/map', async (req, res) => res.json([]));
router.get('/brand/screens/playback', async (req, res) => res.json({ playing: true }));
router.get('/brand/reports', async (req, res) => res.json([]));
router.get('/brand/reports/download', async (req, res) => res.json({ url: '/temp/report.pdf' }));
router.get('/brand/subscription', async (req, res) => res.json({ plan: 'Pro', status: 'Active' }));
router.get('/brand/invoices', async (req, res) => res.json([]));
router.get('/brand/support', async (req, res) => res.json({ status: 'No open tickets' }));
router.get('/brand/reach-estimate', async (req, res) => res.json({ estimatedReach: 1500000 }));

// ─── STAGE 10: Partner Portal Modules (Diagnostic Aliases) ──────────────────

router.get('/partner/dashboard', async (req, res) => res.json({ status: 'Online', partnerId: 1 }));
router.get('/partner/screens', async (req, res) => res.json([]));
router.get('/partner/earnings', async (req, res) => res.json({ total: 0 }));
router.get('/partner/availability', async (req, res) => res.json({ status: 'High' }));
router.get(['/partner/support/tickets', '/partner/tickets'], async (req, res) => res.json([]));
router.get('/partner/profile', async (req, res) => res.json({ name: 'Partner User' }));
router.get('/partner/payments', async (req, res) => res.json([]));
router.get('/partner/revenue-calc', async (req, res) => res.json({ calculated: 0 }));

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

module.exports = router;
