const { dbAll, dbRun, dbReady } = require('./database');

async function backfillLogs() {
    await dbReady;
    console.log('[Backfill] Starting log backfill...');

    try {
        // 1. Backfill Screen Creation
        const screens = await dbAll('SELECT id, name, created_at FROM screens');
        for (const s of screens) {
            await dbRun(
                'INSERT IGNORE INTO screen_event_logs (screen_id, event_type, details, created_at) VALUES (?, ?, ?, ?)',
                [s.id, 'provisioning', `Screen record created in CMS.`, s.created_at]
            );
        }
        console.log(`[Backfill] Logged ${screens.length} screen creation events.`);

        // 2. Backfill Offline Windows
        const windows = await dbAll(`
            SELECT ow.*, s.id as screen_id 
            FROM offline_windows ow 
            JOIN screens s ON s.xibo_display_id = ow.display_id
        `);
        for (const w of windows) {
            // Log Start
            await dbRun(
                'INSERT IGNORE INTO screen_event_logs (screen_id, event_type, details, created_at) VALUES (?, ?, ?, ?)',
                [w.screen_id, 'status_change', 'Screen went OFFLINE', w.offline_start]
            );
            // Log End if exists
            if (w.offline_end) {
                await dbRun(
                    'INSERT IGNORE INTO screen_event_logs (screen_id, event_type, details, created_at) VALUES (?, ?, ?, ?)',
                    [w.screen_id, 'status_change', 'Screen back ONLINE', w.offline_end]
                );
            }
        }
        console.log(`[Backfill] Logged ${windows.length} connectivity windows.`);

        // 3. Backfill Slot Updates (from current state)
        const slots = await dbAll('SELECT * FROM slots WHERE status = "Assigned"');
        for (const sl of slots) {
            const scr = await dbGet('SELECT id FROM screens WHERE xibo_display_id = ?', [sl.displayId]);
            if (scr) {
                 await dbRun(
                    'INSERT IGNORE INTO screen_event_logs (screen_id, event_type, details, created_at) VALUES (?, ?, ?, ?)',
                    [scr.id, 'slot_update', `Slot ${sl.slot_number} assigned with Media ID ${sl.mediaId}`, sl.updated_at]
                );
            }
        }

        console.log('[Backfill] COMPLETE!');
    } catch (err) {
        console.error('[Backfill] Error:', err.message);
    }
}

// Helper since dbGet isn't in scope for the script but available in database.js
async function dbGet(sql, params) {
    const rows = await dbAll(sql, params);
    return rows[0];
}

if (require.main === module) {
    backfillLogs().then(() => process.exit(0));
}
