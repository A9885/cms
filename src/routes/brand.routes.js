const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/database');
const xiboService = require('../services/xibo.service');

// ─── HELPER: Get all Xibo stats for given displayIds ───────────────────────
async function getStatsForDisplays(displayIds) {
    if (!displayIds || displayIds.length === 0) return [];
    try {
        const statsService = require('../services/stats.service');
        const recent = await statsService.getRecentStats();
        const allRecords = recent.data || [];
        // Filter to only records from screens this brand has slots on
        return allRecords.filter(r => displayIds.includes(r.displayId));
    } catch (e) {
        console.error('[Brand API] Stats fetch error:', e.message);
        return [];
    }
}

// ─── HELPER: Get all slots for this brand with screen info ────────────────
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
router.get('/dashboard', async (req, res) => {
    try {
        const brandId = req.user.brand_id;

        // 1. Get all slots assigned to this brand
        const mySlots = await getBrandSlots(brandId);
        const displayIds = [...new Set(mySlots.map(s => s.displayId).filter(Boolean))];
        const totalSlots = mySlots.length;
        const uniqueScreens = displayIds.length;

        // 2. Check which displays are online
        let onlineNow = 0;
        try {
            const displays = await xiboService.getDisplays();
            onlineNow = displays.filter(d =>
                displayIds.includes(d.displayId) && (d.loggedIn === 1 || d.loggedIn === true)
            ).length;
        } catch (e) {}

        // 3. Get play stats for this brand's screens
        const statsForBrand = await getStatsForDisplays(displayIds);
        const totalPlays = statsForBrand.reduce((sum, r) => sum + (r.count || 1), 0);

        // 4. Campaigns count from media_brands (optional — linked media)
        const campaignsCount = await dbGet(
            'SELECT COUNT(DISTINCT mediaId) as count FROM media_brands WHERE brand_id = ?', [brandId]
        );

        // 5. Recent Proof of Play — last 5 play events on brand's screens
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

// ─── MY SCREENS — slots assigned to this brand ───────────────────────────
router.get('/screens', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const mySlots = await getBrandSlots(brandId);

        // Group by screen
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

        // Check online status
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

// ─── BUY SLOTS — all screens with available slot counts ──────────────────
router.get('/screens/available', async (req, res) => {
    try {
        // Get all local screens that have a xibo_display_id
        const allScreens = await dbAll(`SELECT * FROM screens WHERE xibo_display_id IS NOT NULL`);

        // For each screen, count taken vs available slots out of 20
        const result = [];
        for (const screen of allScreens) {
            const takenSlots = await dbAll(
                'SELECT slot_number FROM slots WHERE displayId = ? AND brand_id IS NOT NULL',
                [screen.xibo_display_id]
            );
            const takenNumbers = takenSlots.map(s => s.slot_number);
            const availableCount = 20 - takenNumbers.length;
            if (availableCount > 0) {
                result.push({
                    displayId: screen.xibo_display_id,
                    name: screen.name,
                    city: screen.city || '-',
                    address: screen.address || '-',
                    availableCount,
                    takenSlots: takenNumbers,
                    // available slot numbers
                    availableSlots: Array.from({ length: 20 }, (_, i) => i + 1)
                        .filter(n => !takenNumbers.includes(n))
                });
            }
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── SCREEN LOCATIONS (for map) ──────────────────────────────────────────
router.get('/screens/locations', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const mySlots = await getBrandSlots(brandId);
        const displayIds = [...new Set(mySlots.map(s => s.displayId).filter(Boolean))];

        // Get lat/lng from Xibo API
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

        // Build enriched location records
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


router.post('/slots/purchase', async (req, res) => {
    const brandId = req.user.brand_id;
    const { displayId, slot_numbers } = req.body;
    if (!displayId || !slot_numbers || !Array.isArray(slot_numbers)) {
        return res.status(400).json({ error: 'displayId and an array of slot_numbers are required.' });
    }
    try {
        for (const slot_number of slot_numbers) {
            const existing = await dbGet(
                'SELECT * FROM slots WHERE displayId = ? AND slot_number = ?',
                [displayId, slot_number]
            );
            if (existing) {
                if (existing.brand_id) {
                    continue; // Already taken — skip
                }
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
        }
        res.json({ success: true, message: 'Slots reserved successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PROOF OF PLAY — full PoP log for brand's screens ────────────────────
router.get('/proof-of-play', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const mySlots = await getBrandSlots(brandId);
        const displayIds = [...new Set(mySlots.map(s => s.displayId).filter(Boolean))];

        if (displayIds.length === 0) {
            return res.json([]);
        }

        // Get ALL recent stats and filter to this brand's display IDs
        const statsService = require('../services/stats.service');
        const recent = await statsService.getRecentStats();
        const brandStats = (recent.data || []).filter(r => displayIds.includes(r.displayId));

        // Enrich with slot number
        const enriched = brandStats.map(r => {
            const slot = mySlots.find(s => s.displayId === r.displayId);
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

// ─── CAMPAIGNS (linked media) ─────────────────────────────────────────────
router.get('/campaigns', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const mySlots = await getBrandSlots(brandId);

        if (mySlots.length === 0) return res.json([]);

        let library = [];
        try {
            library = await xiboService.getLibrary({ length: 500 });
        } catch (e) {}
        const mediaMap = {};
        library.forEach(m => { mediaMap[m.mediaId] = m.name; });

        const statsService = require('../services/stats.service');
        const summary = await statsService.getAllMediaStats();

        // Build a campaign row for each slot
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

// ─── INVOICES ─────────────────────────────────────────────────────────────
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
