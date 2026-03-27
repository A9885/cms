const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/database');
const xiboService = require('../services/xibo.service');

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Fetch and filter Xibo play stats for a list of display IDs.
 * @param {Array<number|string>} displayIds - The displays to filter stats for.
 * @returns {Promise<Array>} List of relevant play records.
 */
async function getStatsForDisplays(displayIds) {
    if (!displayIds || displayIds.length === 0) return [];
    try {
        const statsService = require('../services/stats.service');
        const recent = await statsService.getRecentStats();
        const allRecords = recent.data || [];
        return allRecords.filter(r => displayIds.includes(r.displayId));
    } catch (e) {
        console.error('[Brand API] Stats fetch error:', e.message);
        return [];
    }
}

/**
 * Fetch all slots allocated to a specific brand, including screen metadata.
 * @param {number|string} brandId - The CRM brand ID.
 * @returns {Promise<Array>} List of slot objects with screen details.
 */
async function getBrandSlots(brandId) {
    return await dbAll(`
        SELECT 
            sl.id, sl.slot_number, sl.displayId, sl.status, sl.brand_id,
            s.name as screen_name, s.city, s.address, s.notes
        FROM slots sl
        LEFT JOIN screens s ON sl.displayId = s.xibo_display_id
        WHERE sl.brand_id = ?
        ORDER BY sl.displayId, sl.slot_number
    `, [brandId]);
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────

/**
 * GET /api/brand/dashboard
 * Returns KPIs for the logged-in brand, including active screens, total plays, 
 * and recent Proof of Play.
 */
router.get('/dashboard', async (req, res) => {
    try {
        const brandId = req.user.brand_id;

        const [mySlots, displays, campaignsCount] = await Promise.all([
            getBrandSlots(brandId),
            xiboService.getDisplays().catch(() => []),
            dbGet('SELECT COUNT(DISTINCT mediaId) as count FROM media_brands WHERE brand_id = ?', [brandId])
        ]);

        const displayIds = [...new Set(mySlots.map(s => s.displayId).filter(Boolean))];
        const totalSlots = mySlots.length;
        const uniqueScreens = displayIds.length;

        const [onlineNow, statsForBrand] = await Promise.all([
            Promise.resolve(displays.filter(d =>
                displayIds.includes(d.displayId) && (d.loggedIn === 1 || d.loggedIn === true)
            ).length),
            getStatsForDisplays(displayIds)
        ]);

        const totalPlays = statsForBrand.reduce((sum, r) => sum + (r.count || 1), 0);

        const recentPoP = statsForBrand
            .sort((a, b) => new Date(b.playedAt || 0) - new Date(a.playedAt || 0))
            .slice(0, 5)
            .map(r => ({
                adName: r.adName,
                displayId: r.displayId,
                displayName: r.displayName,
                playedAt: r.playedAt,
                count: r.count
            }));

        res.json({
            activeScreens:  uniqueScreens,
            totalSlots:     totalSlots,
            onlineScreens:  onlineNow,
            totalCampaigns: campaignsCount?.count || 0,
            totalPlays:     totalPlays,
            recentPoP
        });
    } catch (err) {
        console.error('[Brand API] Dashboard Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── MY SCREENS ────────────────────────────────────────────────────────────

/**
 * GET /api/brand/screens
 * Returns all screens where the brand has at least one slot assigned.
 * Includes real-time online/offline status from Xibo.
 */
router.get('/screens', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const mySlots = await getBrandSlots(brandId);
        const screens = {};
        mySlots.forEach(slot => {
            const key = slot.displayId;
            if (!screens[key]) {
                screens[key] = {
                    displayId: slot.displayId,
                    name: slot.screen_name || `Display #${slot.displayId}`,
                    city: slot.city || '-',
                    address: slot.address || '-',
                    location: slot.notes || '-',
                    slots: [],
                    status: 'offline'
                };
            }
            screens[key].slots.push(slot.slot_number);
        });

        try {
            const displays = await xiboService.getDisplays();
            displays.forEach(d => {
                if (screens[d.displayId]) {
                    screens[d.displayId].status = (d.loggedIn === 1 || d.loggedIn === true) ? 'online' : 'offline';
                    screens[d.displayId].lastAccess = d.lastAccessed;
                }
            });
        } catch (e) {}

        res.json(Object.values(screens));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/brand/screens/available
 * Lists all network screens that have at least one unassigned slot.
 */
router.get('/screens/available', async (req, res) => {
    try {
        const allScreens = await dbAll(`SELECT * FROM screens WHERE xibo_display_id IS NOT NULL`);
        const result = await Promise.all(allScreens.map(async (screen) => {
            const takenSlots = await dbAll(
                'SELECT slot_number FROM slots WHERE displayId = ? AND brand_id IS NOT NULL',
                [screen.xibo_display_id]
            );
            const takenNumbers = takenSlots.map(s => s.slot_number);
            const availableCount = 20 - takenNumbers.length;
            if (availableCount > 0) {
                return {
                    displayId: screen.xibo_display_id,
                    name: screen.name,
                    city: screen.city || '-',
                    address: screen.address || '-',
                    availableCount,
                    takenSlots: takenNumbers,
                    availableSlots: Array.from({ length: 20 }, (_, i) => i + 1)
                        .filter(n => !takenNumbers.includes(n))
                };
            }
            return null;
        }));
        res.json(result.filter(Boolean));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/brand/screens/locations
 * Returns geographic coordinates for all screens used by this brand (for map view).
 */
router.get('/screens/locations', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const mySlots = await getBrandSlots(brandId);
        const displayIds = [...new Set(mySlots.map(s => s.displayId).filter(Boolean))];

        let gpsMap = {};
        try {
            const displays = await xiboService.getDisplays();
            displays.forEach(d => {
                if (displayIds.includes(d.displayId)) {
                    gpsMap[d.displayId] = {
                        lat: parseFloat(d.latitude) || null,
                        lng: parseFloat(d.longitude) || null,
                        name: d.display || d.displayId
                    };
                }
            });
        } catch (e) {}

        const locations = mySlots
            .filter(s => s.displayId)
            .reduce((acc, slot) => {
                const key = slot.displayId;
                if (!acc[key]) {
                    const gps = gpsMap[slot.displayId] || {};
                    acc[key] = {
                        displayId: slot.displayId,
                        name: slot.screen_name || gps.name || `Display #${slot.displayId}`,
                        city: slot.city || '-',
                        lat: gps.lat,
                        lng: gps.lng,
                        slots: []
                    };
                }
                acc[key].slots.push(slot.slot_number);
                return acc;
            }, {});

        res.json(Object.values(locations));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/brand/slots/purchase
 * Allows a brand to reserve one or more slots on a screen.
 */
router.post('/slots/purchase', async (req, res) => {
    const brandId = req.user.brand_id;
    const { displayId, slot_numbers } = req.body;
    if (!displayId || !slot_numbers || !Array.isArray(slot_numbers)) {
        return res.status(400).json({ error: 'displayId and an array of slot_numbers are required.' });
    }
    try {
        await Promise.all(slot_numbers.map(async (slot_number) => {
            const existing = await dbGet(
                'SELECT * FROM slots WHERE displayId = ? AND slot_number = ?',
                [displayId, slot_number]
            );
            if (existing) {
                if (existing.brand_id) return; 
                await dbRun(
                    'UPDATE slots SET brand_id = ?, status = "Reserved", updated_at = CURRENT_TIMESTAMP WHERE displayId = ? AND slot_number = ?',
                    [brandId, displayId, slot_number]
                );
            } else {
                await dbRun(
                    'INSERT INTO slots (displayId, slot_number, brand_id, status) VALUES (?, ?, ?, "Reserved")',
                    [displayId, slot_number, brandId]
                );
            }
        }));
        res.json({ success: true, message: 'Slots reserved successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/brand/proof-of-play
 * Returns detailed playback history for all screens assigned to this brand.
 */
router.get('/proof-of-play', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const mySlots = await getBrandSlots(brandId);
        const displayIds = [...new Set(mySlots.map(s => s.displayId).filter(Boolean))];

        if (displayIds.length === 0) return res.json([]);

        const statsService = require('../services/stats.service');
        const recent = await statsService.getRecentStats();
        const brandStats = (recent.data || []).filter(r => displayIds.includes(r.displayId));

        const enriched = brandStats.map(r => {
            const slot = mySlots.find(s => String(s.displayId) === String(r.displayId));
            return {
                ...r,
                slotNumber: slot ? slot.slot_number : '-',
                screenName: slot ? (slot.screen_name || `Display #${r.displayId}`) : `Display #${r.displayId}`
            };
        });

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/brand/campaigns
 * Returns play counts for each assigned slot to track campaign performance.
 */
router.get('/campaigns', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const mySlots = await getBrandSlots(brandId);
        if (mySlots.length === 0) return res.json([]);

        const statsService = require('../services/stats.service');
        const summary = await statsService.getAllMediaStats();

        const campaigns = mySlots.map(slot => {
            const stats = summary.find(s => String(s.mediaId).includes(`SCREEN_${slot.displayId}_SLOT_${slot.slot_number}`)) || {};
            return {
                displayId: slot.displayId,
                screenName: slot.screen_name || `Display #${slot.displayId}`,
                slot_number: slot.slot_number,
                mediaName: `Slot ${slot.slot_number} — ${slot.screen_name || 'Screen'}`,
                plays: stats.totalPlays || 0,
                status: slot.status || 'Reserved'
            };
        });

        res.json(campaigns);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** GET /api/brand/invoices - List invoices for the logged-in brand. */
router.get('/invoices', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const invoices = await dbAll(
            'SELECT * FROM invoices WHERE brand_id = ? ORDER BY due_date DESC', [brandId]
        );
        res.json(invoices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
