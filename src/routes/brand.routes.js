const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/database');
const xiboService = require('../services/xibo.service');
const statsService = require('../services/stats.service');

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────

/**
 * Fetch and filter Xibo play stats for a specific brand's media.
 * @param {number|string} brandId - The brand ID to filter for.
 * @returns {Promise<Array>} List of relevant play records.
 */
async function getStatsForBrand(brandId) {
    try {
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
            sl.start_date, sl.end_date, sl.creative_name, sl.mediaId,
            s.name as screen_name, s.city, s.address, s.notes,
            s.latitude, s.longitude
        FROM slots sl
        LEFT JOIN screens s ON sl.displayId = s.xibo_display_id
        WHERE sl.brand_id = ?
        ORDER BY sl.displayId, sl.slot_number
    `, [brandId]);
}

// ─── PROFILE ──────────────────────────────────────────────────────────────

/**
 * GET /brandportal/api/profile
 * Returns the brand's own details including extra_fields.
 */
router.get('/profile', async (req, res) => {
    const brandId = req.user.brand_id;
    console.log(`[Brand API] Fetching profile for brandId: ${brandId}, User: ${req.user.email}`);
    try {
        if (!brandId) return res.status(400).json({ error: 'No brand assigned to this user' });
        const brand = await dbGet('SELECT * FROM brands WHERE id = ?', [brandId]);
        if (!brand) return res.status(404).json({ error: 'Brand not found' });
        
        // Remove sensitive info if any
        delete brand.password;
        
        res.json(brand);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ─── SUBSCRIPTION ─────────────────────────────────────────────────────────

/**
 * GET /brandportal/api/subscription
 * Returns the brand's active (or most recent) subscription summary.
 */
router.get('/subscription', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const sub = await dbGet(`
            SELECT 
                plan_name as planName, 
                status, 
                DATE_FORMAT(start_date, '%Y-%m-%d') as startDate, 
                DATE_FORMAT(end_date, '%Y-%m-%d') as endDate,
                payment_status as paymentStatus,
                cities,
                screens_included as screensIncluded,
                slots_included as slotsIncluded,
                DATEDIFF(end_date, CURDATE()) as daysRemaining
            FROM subscriptions 
            WHERE brand_id = ? AND status = 'Active'
            ORDER BY id DESC LIMIT 1
        `, [brandId]);

        if (!sub) return res.json(null);

        // Count current usage
        const usage = await dbGet(`
            SELECT 
                COUNT(DISTINCT displayId) as screensUsed,
                COUNT(*) as slotsUsed
            FROM slots 
            WHERE brand_id = ?
        `, [brandId]);

        res.json({
            ...sub,
            screensUsed: usage.screensUsed || 0,
            slotsUsed: usage.slotsUsed || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/subscriptions/history', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        const history = await dbAll(`
            SELECT 
                plan_name as planName, 
                status, 
                DATE_FORMAT(start_date, '%Y-%m-%d') as startDate, 
                DATE_FORMAT(end_date, '%Y-%m-%d') as endDate,
                payment_status as paymentStatus,
                screens_included as screensIncluded,
                slots_included as slotsIncluded
            FROM subscriptions 
            WHERE brand_id = ?
            ORDER BY start_date DESC
        `, [brandId]);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────


/**
 * GET /api/brand/dashboard
 * Returns KPIs for the logged-in brand, including active screens, total plays, 
 * and recent Proof of Play.
 */
router.get('/dashboard', async (req, res) => {
    try {
        const brandId = req.user.brand_id;

        // 1. Fetch ALL slots (Active and Reserved) to show full inventory
        const [mySlots, brandMedia, statsSummary] = await Promise.all([
            dbAll('SELECT id, displayId, mediaId, status FROM slots WHERE brand_id = ?', [brandId]),
            dbAll('SELECT mediaId FROM media_brands WHERE brand_id = ?', [brandId]),
            statsService.getAllMediaStats()
        ]);

        const uniqueScreens = new Set(mySlots.map(s => s.displayId).filter(Boolean)).size;
        const totalSlots = mySlots.length;
        const activeCount = mySlots.filter(s => s.status === 'Active').length;
        const reservedCount = mySlots.filter(s => s.status === 'Reserved').length;

        // 2. Fetch coordinates for ALL brand screens for the map
        const displayIds = [...new Set(mySlots.map(s => s.displayId).filter(Boolean))];
        let brandScreens = [];
        if (displayIds.length > 0) {
            const placeholders = displayIds.map(() => '?').join(',');
            brandScreens = await dbAll(`SELECT xibo_display_id as displayId, name, latitude, longitude, status FROM screens WHERE xibo_display_id IN (${placeholders})`, displayIds);
        }

        // 3. Calculate total plays directly from local DB to avoid noise filtering mismatches
        const totalPlaysRow = await dbGet(`
            SELECT SUM(count) as total 
            FROM daily_media_stats 
            WHERE mediaId IN (SELECT mediaId FROM media_brands WHERE brand_id = ?)
        `, [brandId]);
        const totalPlays = totalPlaysRow ? parseInt(totalPlaysRow.total || 0, 10) : 0;

        // 4. Online Screen check (from Xibo)
        let onlineNow = 0;
        let isSyncing = false;
        try {
            const res = await xiboService.getDisplays();
            isSyncing = res.syncing || false;
            const displays = isSyncing ? [] : res;
            
            const myDisplayIds = new Set(displayIds.map(id => String(id)));
            onlineNow = displays.filter(d => 
                myDisplayIds.has(String(d.displayId)) && (d.loggedIn === 1 || d.loggedIn === true)
            ).length;
        } catch (e) {
            console.warn('[Dashboard] Display sync error:', e.message);
        }

        // 5. Daily Breakdown (last 7 days) from local DB cache
        const dailyData = await dbAll(`
            SELECT date, SUM(count) as counts
            FROM daily_media_stats
            WHERE mediaId IN (SELECT mediaId FROM media_brands WHERE brand_id = ?)
              AND date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY date
            ORDER BY date ASC
        `, [brandId]);

        const dailyMap = {};
        const labels = [];
        for (let i = 6; i >= 0; i--) {
            const dateStr = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
            dailyMap[dateStr] = 0;
            labels.push(dateStr);
        }
        dailyData.forEach(row => {
            const d = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
            if (dailyMap.hasOwnProperty(d)) dailyMap[d] = row.counts;
        });

        const dailyStats = labels.map(date => ({ date, count: dailyMap[date] }));

        // 6. Recent Proof of Play from local cache (top 10)
        const [recentPoPRecords, libraryRes, displaysRes] = await Promise.all([
            dbAll(`
                SELECT s.mediaId, s.displayId, s.date, s.count, m.brand_id, sl.slot_number
                FROM daily_media_stats s
                JOIN media_brands m ON s.mediaId = m.mediaId
                LEFT JOIN slots sl ON (s.mediaId = sl.mediaId AND s.displayId = sl.displayId)
                WHERE m.brand_id = ?
                ORDER BY s.date DESC
                LIMIT 10
            `, [brandId]),
            xiboService.getLibrary({ length: 500 }),
            xiboService.getDisplays()
        ]);

        if (libraryRes.syncing || displaysRes.syncing) isSyncing = true;
        
        const library = libraryRes.syncing ? [] : libraryRes;
        const displaysList = displaysRes.syncing ? [] : displaysRes;

        const libraryMap = new Map((library || []).map(m => [String(m.mediaId), m.name]));
        const displayMap = new Map((displaysList || []).map(d => [String(d.displayId), d.display]));

        const recentPoP = recentPoPRecords.map(r => ({
            adName: beautifyMediaName(libraryMap.get(String(r.mediaId)) || `Media #${r.mediaId}`),
            displayId: r.displayId,
            displayName: displayMap.get(String(r.displayId)) || `Display #${r.displayId}`,
            slotNumber: r.slot_number,
            playedAt: r.date,
            count: r.count
        }));


        res.json({
            activeScreens:  uniqueScreens,
            totalSlots:     totalSlots, 
            activeCount,
            reservedCount,
            onlineScreens:  onlineNow,
            totalPlays:     totalPlays,
            recentPoP,
            dailyStats,
            brandScreens,
            syncing: isSyncing
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
                    lat: parseFloat(slot.latitude) || null,
                    lng: parseFloat(slot.longitude) || null,
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
                    // Supplement with Xibo GPS if DB latitude is missing
                    if (!screens[d.displayId].lat && d.latitude)
                        screens[d.displayId].lat = parseFloat(d.latitude) || null;
                    if (!screens[d.displayId].lng && d.longitude)
                        screens[d.displayId].lng = parseFloat(d.longitude) || null;
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
        const allScreens = await dbAll(`SELECT xibo_display_id, name, city, address, resolution FROM screens WHERE xibo_display_id IS NOT NULL`);
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
                    resolution: screen.resolution || '-',
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
 * GET /api/brand/screens/:displayId
 * Returns full detail for a single screen: slots with media names, total plays.
 * NOTE: Must be declared AFTER all static /screens/X sub-routes to avoid wildcard collision.
 */
router.get('/screens/:displayId', async (req, res) => {
    const brandId = req.user.brand_id;
    const displayId = parseInt(req.params.displayId, 10);
    if (!displayId) return res.status(400).json({ error: 'Invalid displayId' });

    try {
        // 1. ALL Slots for this screen (to show capacity and ownership)
        const allSlots = await dbAll(`
            SELECT sl.slot_number, sl.status, sl.mediaId, sl.creative_name as media_name, sl.brand_id
            FROM slots sl
            WHERE sl.displayId = ?
            ORDER BY sl.slot_number
        `, [displayId]);

        // 2. Screen metadata + Partner name
        const screen = await dbGet(`
            SELECT s.name, s.city, s.address, s.notes, s.latitude, s.longitude, s.xibo_display_id, p.name as partner_name
            FROM screens s
            LEFT JOIN partners p ON s.partner_id = p.id
            WHERE s.xibo_display_id = ?
        `, [displayId]);

        // 3. Online status from Xibo — with 3s timeout so it never blocks
        let status = 'offline';
        let lastAccess = null;
        try {
            const xiboTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000));
            const displaysRes = await Promise.race([xiboService.getDisplays(), xiboTimeout]);
            const d = (displaysRes || []).find(x => String(x.displayId) === String(displayId));
            if (d) {
                status = (d.loggedIn === 1 || d.loggedIn === true) ? 'online' : 'offline';
                lastAccess = d.lastAccessed || null;
            }
        } catch (e) { /* Xibo unavailable or timed out — keep offline */ }

        // 4. Per-slot play counts (only for THIS brand's media)
        const myMediaIds = allSlots
            .filter(s => s.brand_id === brandId && s.mediaId)
            .map(s => s.mediaId);
            
        let totalPlays = 0;
        const slotPlaysMap = {};

        if (myMediaIds.length > 0) {
            const placeholders = myMediaIds.map(() => '?').join(',');
            const [playsTotal, playsPerMedia] = await Promise.all([
                dbGet(
                    `SELECT SUM(count) as total FROM daily_media_stats WHERE displayId = ? AND mediaId IN (${placeholders})`,
                    [displayId, ...myMediaIds]
                ),
                dbAll(
                    `SELECT mediaId, SUM(count) as plays FROM daily_media_stats WHERE displayId = ? AND mediaId IN (${placeholders}) GROUP BY mediaId`,
                    [displayId, ...myMediaIds]
                )
            ]);
            totalPlays = playsTotal ? parseInt(playsTotal.total || 0, 10) : 0;
            playsPerMedia.forEach(row => { slotPlaysMap[String(row.mediaId)] = parseInt(row.plays || 0, 10); });
        }

        // Enrich slots with ownership flag and play counts
        const enrichedSlots = allSlots.map(s => ({
            ...s,
            isOwnedByMe: s.brand_id === brandId,
            plays: (s.brand_id === brandId && s.mediaId) ? (slotPlaysMap[String(s.mediaId)] || 0) : 0
        }));

        res.json({
            displayId,
            name: screen ? screen.name : `Display #${displayId}`,
            partnerName: screen ? screen.partner_name : 'Signtral Network',
            city: screen ? (screen.city || '-') : '-',
            address: screen ? (screen.address || '-') : '-',
            notes: screen ? (screen.notes || '-') : '-',
            lat: screen ? (parseFloat(screen.latitude) || null) : null,
            lng: screen ? (parseFloat(screen.longitude) || null) : null,
            status,
            lastAccess,
            slots: enrichedSlots,
            totalPlays
        });
    } catch (err) {
        console.error('[Brand API] Screen detail error:', err.message);
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

        logActivity({
            action: ACTION.CREATE,
            module: MODULE.SLOT,
            description: `Brand self-reserved slots ${slot_numbers.join(', ')} on Display ${displayId}`,
            req
        });

        res.json({ success: true, message: 'Slots reserved successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/brand/proof-of-play
 * Returns playback history for all media assigned to this brand's slots.
 * Source: daily_media_stats (local DB) — NOT the Xibo live API.
 * This ensures all media appear, not just those Xibo reports recently.
 */
router.get('/proof-of-play', async (req, res) => {
    const brandId = req.user.brand_id;
    try {
        // Get all slots for this brand (with screen info)
        const mySlots = await getBrandSlots(brandId);
        if (mySlots.length === 0) return res.json([]);

        // Get all mediaIds belonging to this brand
        const brandMediaIds = await dbAll(
            'SELECT mediaId FROM media_brands WHERE brand_id = ?',
            [brandId]
        );
        if (brandMediaIds.length === 0) return res.json([]);

        const mediaIds = brandMediaIds.map(r => r.mediaId).filter(Boolean);
        const placeholders = mediaIds.map(() => '?').join(',');

        // Query daily_media_stats for all brand media, grouped by mediaId + displayId
        const stats = await dbAll(`
            SELECT
                dms.mediaId,
                dms.displayId,
                SUM(dms.count)      AS totalPlays,
                MAX(dms.date)       AS lastPlayed
            FROM daily_media_stats dms
            WHERE dms.mediaId IN (${placeholders})
            GROUP BY dms.mediaId, dms.displayId
            ORDER BY lastPlayed DESC
        `, mediaIds);

        if (stats.length === 0) return res.json([]);

        // Build a lookup: mediaId → slot info
        const slotsByMedia = {};
        mySlots.forEach(sl => {
            if (sl.mediaId) slotsByMedia[String(sl.mediaId)] = sl;
        });

        // Also build a lookup by displayId for media without a direct slot link
        const slotsByDisplay = {};
        mySlots.forEach(sl => {
            if (!slotsByDisplay[String(sl.displayId)]) slotsByDisplay[String(sl.displayId)] = sl;
        });

        // Build the result rows
        const rows = stats.map(row => {
            const mediaIdStr = String(row.mediaId);
            const displayIdStr = String(row.displayId);

            // Find the slot: prefer exact mediaId match, fall back to display match
            const slot = slotsByMedia[mediaIdStr] || slotsByDisplay[displayIdStr] || null;

            return {
                mediaId: row.mediaId,
                displayId: row.displayId,
                adName: slot ? (slot.creative_name || `Media #${row.mediaId}`) : `Media #${row.mediaId}`,
                screenName: slot ? (slot.screen_name || `Display #${row.displayId}`) : `Display #${row.displayId}`,
                location: slot
                    ? ([slot.address, slot.city].filter(v => v && v !== '-').join(', ') || 'Central')
                    : 'Central',
                slotNumber: slot ? slot.slot_number : '-',
                count: parseInt(row.totalPlays || 0, 10),
                totalPlays: parseInt(row.totalPlays || 0, 10),
                lastPlayed: row.lastPlayed
            };
        });

        res.json(rows);
    } catch (err) {
        console.error('[Brand API] proof-of-play error:', err.message);
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
                SELECT sl.id, sl.creative_name as campaign_name, sl.displayId as screen_id, s.name as screen_name, s.city, s.address as location,
                sl.slot_number, sl.start_date, sl.end_date, sl.status, sl.mediaId as creative_id,
                mb.created_at as upload_date
                FROM slots sl
                LEFT JOIN screens s ON sl.displayId = s.xibo_display_id
                LEFT JOIN media_brands mb ON sl.mediaId = mb.mediaId
                WHERE sl.brand_id = ? AND sl.mediaId IS NOT NULL
                ORDER BY sl.updated_at DESC
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
                uploadDate: c.upload_date,
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
    // TODO: Enable in v2.0
    return res.status(503).json({ error: 'Billing feature is temporarily unavailable.' });
});

/** POST /api/sync-stats - Force a manual data refresh from Xibo. */
router.post('/sync-stats', async (req, res) => {
    try {
        // Trigger the global sync service
        await statsService.syncAllStats();
        res.json({ success: true, message: 'Data synchronization complete.' });
    } catch (err) {
        console.error('[Brand Sync] Manual sync failed:', err.message);
        res.status(500).json({ error: 'Manual synchronization failed. Please try again later.' });
    }
});

module.exports = router;
