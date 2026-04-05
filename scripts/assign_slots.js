require('dotenv').config();
const xiboService = require('../src/services/xibo.service');
const { dbRun, dbAll, dbReady } = require('../src/db/database');

/**
 * assignCreativeToSlot
 * 1. Obtains a fresh Xibo OAuth2 token (via xiboService).
 * 2. Assigns media (creative) to a Xibo Slot Playlist.
 * 3. Updates local database logic with status='Active' and xibo_widget_id.
 * 4. Logs full error response on failure and throws.
 */
async function assignCreativeToSlot(playlistId, mediaId, duration = 13) {
    try {
        console.log(`[Assign] Playlist ID: ${playlistId} | mediaId: ${mediaId} | duration: ${duration}s`);
        
        // Step 1 & 2: Get token and assign media using its internal library assign logic
        const widget = await xiboService.assignMediaToPlaylist(playlistId, mediaId, duration);

        if (!widget || !widget.widgetId) {
            throw new Error(`Xibo assignment returned no valid widget data: ${JSON.stringify(widget)}`);
        }

        const widgetId = widget.widgetId;

        // Step 3: Update local database (targeting 'slots' table as confirmed in schema)
        await dbRun(
            "UPDATE slots SET status='Active', xibo_widget_id=?, mediaId=?, duration=? WHERE playlist_id=?",
            [widgetId, mediaId, duration, playlistId]
        );

        console.log(`✅ Success: Assigned widget ${widgetId} to playlist ${playlistId}`);
        return widget;

    } catch (err) {
        // Step 4: Log full error response if available and throw
        const errorDetail = err.response?.data || err.message;
        console.error(`❌ Assignment Failed for Playlist ${playlistId}:`, JSON.stringify(errorDetail, null, 2));
        throw new Error(`Xibo Assignment Failure: ${JSON.stringify(errorDetail)}`);
    }
}

/**
 * assignAllPendingSlots
 * Scans for 'Reserved' slots and executes the assignment workflow for each.
 */
async function assignAllPendingSlots() {
    console.log('\n--- Checking for Pending Slot Assignments ---');
    try {
        // Ensure DB schema is ready and migrations have run
        await dbReady;

        // Query for 'Reserved' slots (as requested)
        const pending = await dbAll("SELECT id, playlist_id, mediaId, duration FROM slots WHERE status = 'Reserved'");
        
        if (pending.length === 0) {
            console.log('No "Reserved" slots found in database.');
            return;
        }

        console.log(`Processing ${pending.length} reserved slot(s)...`);

        for (const slot of pending) {
            try {
                if (!slot.playlist_id || !slot.mediaId) {
                    console.warn(`[Skip] Slot ID ${slot.id} is missing playlist_id or mediaId.`);
                    continue;
                }
                await assignCreativeToSlot(slot.playlist_id, slot.mediaId, slot.duration || 13);
            } catch (err) {
                console.error(`[Error] Failed to process slot ${slot.id}. Moving to next...`);
            }
        }
        
        console.log('--- All Pending Assignments Processed ---\n');
    } catch (err) {
        console.error('[Fatal] assignAllPendingSlots execution failed:', err.message);
    }
}

module.exports = { assignCreativeToSlot, assignAllPendingSlots };

// Auto-run if script is called directly
if (require.main === module) {
    assignAllPendingSlots().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
