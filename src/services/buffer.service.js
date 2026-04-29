const { dbRun, dbAll, dbGet } = require('../db/database');

/**
 * BufferService - Manages local storage of playback statistics and offline connectivity windows.
 */
class BufferService {
    /**
     * Inserts a playback record into the local buffer for later synchronization with Xibo.
     */
    async bufferStat(statObj) {
        const { displayId, mediaId, layoutId, widgetId, statDate, duration } = statObj;
        const sql = `
            INSERT INTO stat_buffer 
            (display_id, media_id, layout_id, widget_id, stat_date, duration, synced) 
            VALUES (?, ?, ?, ?, ?, ?, 0)
        `;
        return await dbRun(sql, [displayId, mediaId, layoutId, widgetId, statDate, duration]);
    }

    /**
     * Retrieves up to 100 unsynced statistics for a specific display.
     */
    async getPendingStats(displayId) {
        const sql = `
            SELECT * FROM stat_buffer 
            WHERE synced = 0 AND display_id = ? 
            ORDER BY stat_date ASC 
            LIMIT 100
        `;
        return await dbAll(sql, [displayId]);
    }

    /**
     * Marks a list of buffer IDs as successfully synchronized.
     */
    async markSynced(ids) {
        if (!ids || ids.length === 0) return;
        const placeholders = ids.map(() => '?').join(',');
        const sql = `UPDATE stat_buffer SET synced = 1 WHERE id IN (${placeholders})`;
        return await dbRun(sql, ids);
    }

    /**
     * Increments the retry count for failed synchronization attempts.
     */
    async markSyncFailed(ids) {
        if (!ids || ids.length === 0) return;
        const placeholders = ids.map(() => '?').join(',');
        const sql = `UPDATE stat_buffer SET retry_count = retry_count + 1 WHERE id IN (${placeholders})`;
        await dbRun(sql, ids);

        // Check for records that have failed too many times
        const checkSql = `SELECT id, retry_count FROM stat_buffer WHERE id IN (${placeholders})`;
        const records = await dbAll(checkSql, ids);
        records.forEach(r => {
            if (r.retry_count >= 5) {
                console.warn(`[BufferService] Stat record ID ${r.id} has failed sync 5+ times.`);
            }
        });
    }

    /**
     * Opens a new offline window for a display.
     */
    async recordOfflineStart(displayId) {
        const sql = `INSERT INTO offline_windows (display_id, offline_start) VALUES (?, NOW())`;
        const result = await dbRun(sql, [displayId]);
        return result.insertId;
    }

    /**
     * Closes the most recent open offline window for a display.
     */
    async recordOfflineEnd(displayId) {
        const sql = `
            UPDATE offline_windows 
            SET offline_end = NOW() 
            WHERE display_id = ? AND offline_end IS NULL 
            ORDER BY id DESC LIMIT 1
        `;
        return await dbRun(sql, [displayId]);
    }

    /**
     * Marks all closed offline windows for a display as processed (flushed).
     */
    async markWindowFlushed(displayId) {
        const sql = `
            UPDATE offline_windows 
            SET stats_flushed = 1 
            WHERE display_id = ? AND offline_end IS NOT NULL AND stats_flushed = 0
        `;
        return await dbRun(sql, [displayId]);
    }
}

module.exports = new BufferService();
