const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/database');
const xiboService = require('../services/xibo.service');

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Fetch and filter Xibo play stats for a specific brand's media.
 * @param {number|string} brandId - The brand ID to filter for.
 * @returns {Promise<Array>} List of relevant play records.
 */
async function getStatsForBrand(brandId) {
    try {
        const statsService = require('../services/stats.service');
        const [recent, mySlots] = await Promise.all([
            statsService.getRecentStats(),
            getBrandSlots(brandId)
        ]);

        if (mySlots.length === 0) return [];

        // Build a Set of "displayId_slotNumber" keys for exact matching
        // e.g. "1_1", "1_3" — only slots this brand actually owns
        const mySlotKeys = new Set(
            mySlots
                .filter(s => s.displayId && s.slot_number)
                .map(s => `${s.displayId}_${s.slot_number}`)
        );

        if (mySlotKeys.size === 0) return [];

        const allRecords = recent.data || [];

        // Filter by exact displayId + slot number owned by this brand
        return allRecords.filter(r => {
            const slot = r.slot !== '-' && r.slot != null ? r.slot : null;
            if (!slot) {
                // If we can't determine the slot, fall back to displayId-only match
                // but only include if brand has ALL slots on that display (whole screen owner)
                const displaySlots = mySlots.filter(s => String(s.displayId) === String(r.displayId));
                return displaySlots.length === 20; // owns all 20 slots
            }
            return mySlotKeys.has(`${r.displayId}_${slot}`);
        });
    } catch (e) {
        console.error('[Brand API] Stats fetch error:', e.message);
        return [];
    }
}

/**
 * Beautifies media names by removing technical prefixes and extensions.
 */
/**
 * Beautifies media names by removing technical prefixes and extensions.
 * Ensures unique advertisements are not grouped together.
 */
function beautifyMediaName(name) {
    if (!name) return 'Untitled Ad';
    
    // 1. Remove common system timestamp patterns (e.g., _1774950622819_) and screen prefixes (S1_, S2_)
    let clean = name.replace(/_\d{10,13}_/g, ' ').replace(/S\d+_/g, '');
    
    // 2. Remove file extensions (png, jpg, mp4, etc.)
    clean = clean.replace(/\.(png|jpg|jpeg|mp4|mov|avi|webp)$/i, '');
    
    // 3. Remove underscores and replace with spaces
    clean = clean.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

    // 4. Fallback for generic snapshots vs actual advertisements
    if (clean.toLowerCase() === 'screenshot' || clean.length < 3) {
        return 'System Snapshot'; 
    }
    
    // 5. Truncate very long unique names
    if (clean.length > 60) clean = clean.substring(0, 57) + '...';

    return clean || 'Active Media';
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

        // 1. Fetch campaigns and unique screens from the NEW campaigns table
        const [campaigns, statsSummary] = await Promise.all([
            dbAll('SELECT id, screen_id, creative_id, status FROM campaigns WHERE brand_id = ? AND status = "Active"', [brandId]),
            require('../services/stats.service').getAllMediaStats()
        ]);

        const uniqueScreens = new Set(campaigns.map(c => c.screen_id)).size;
        const totalCampaigns = campaigns.length;

        // 2. Calculate total plays for all this brand's creatives
        const myMediaIds = new Set(campaigns.map(c => c.creative_id));
        const totalPlays = statsSummary.reduce((sum, s) => {
            if (myMediaIds.has(s.mediaId)) return sum + (s.totalPlays || 0);
            return sum;
        }, 0);

        // 3. Online Screen check (from Xibo)
        let onlineNow = 0;
        try {
            const displays = await xiboService.getDisplays();
            const activeScreenIds = new Set(campaigns.map(c => c.screen_id));
            onlineNow = displays.filter(d => 
                activeScreenIds.has(d.display) && (d.loggedIn === 1 || d.loggedIn === true)
            ).length;
        } catch (e) {
            console.warn('[Dashboard] Display sync error:', e.message);
        }

        // 4. Recent Proof of Play
        const recentStats = await require('../services/stats.service').getRecentStats();
        const recentPoP = (recentStats.data || [])
            .filter(r => myMediaIds.has(r.mediaId))
            .slice(0, 10)
            .map(r => ({
                adName: beautifyMediaName(r.adName),
                displayId: r.displayId,
                displayName: r.displayName,
                playedAt: r.playedAt,
                count: r.count
            }));

        res.json({
            activeScreens:  uniqueScreens,
            totalCampaigns: totalCampaigns,
            onlineScreens:  onlineNow,
            totalPlays:     totalPlays,
            estimatedImpressions: totalPlays * 45, // Global brand avg
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

        const brandStats = await getStatsForBrand(brandId);

        const aggregated = {};
        brandStats.forEach(r => {
            const key = `${r.displayId}_${r.mediaId || r.adName}`;
            if (!aggregated[key]) {
                const slot = mySlots.find(s => 
                    String(s.displayId) === String(r.displayId) && 
                    (String(s.slot_number) === String(r.slot) || r.adName.includes(`SLOT_${s.slot_number}`))
                );
                
                aggregated[key] = {
                    mediaId: r.mediaId,
                    displayId: r.displayId,
                    adName: beautifyMediaName(r.adName),
                    screenName: slot ? (slot.screen_name || `Display #${r.displayId}`) : `Display #${r.displayId}`,
                    location: slot ? (slot.address || slot.city || 'Central') : 'Central',
                    count: 0,
                    totalPlays: 0,
                    lastPlayed: r.playedAt,
                    slotNumber: r.slot || (slot ? slot.slot_number : '-')
                };
            }
            aggregated[key].count += (r.count || 1);
            aggregated[key].totalPlays += (r.count || 1);
            if (new Date(r.playedAt) > new Date(aggregated[key].lastPlayed)) {
                aggregated[key].lastPlayed = r.playedAt;
            }
        });

        res.json(Object.values(aggregated).sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed)));
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
        const [campaigns, statsSummary] = await Promise.all([
            dbAll(`
                SELECT c.*, s.name as screen_name, s.city, s.location
                FROM campaigns c
                LEFT JOIN screens s ON c.screen_id = s.screen_id
                WHERE c.brand_id = ?
                ORDER BY c.created_at DESC
            `, [brandId]),
            require('../services/stats.service').getAllMediaStats()
        ]);

        const enriched = campaigns.map(c => {
            const stats = statsSummary.find(s => parseInt(s.mediaId) === parseInt(c.creative_id)) || {};
            return {
                id: c.id,
                name: c.campaign_name,
                screen: c.screen_name || c.screen_id,
                location: c.location || c.city || '-',
                slot: c.slot_number,
                startDate: c.start_date,
                endDate: c.end_date,
                status: c.status,
                plays: stats.totalPlays || 0,
                impact: (stats.totalPlays || 0) * 45
            };
        });

        res.json(enriched);
    } catch (err) {
        console.error('[Brand Campaigns] Error:', err.message);
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
