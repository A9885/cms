const { dbRun, dbGet } = require('./database');

async function migrate() {
    console.log('[Migration] Creating offline backfill tables and updating schema...');

    try {
        // 1. Create stat_buffer table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS stat_buffer (
                id INT PRIMARY KEY AUTO_INCREMENT,
                display_id INT NOT NULL,
                media_id INT,
                layout_id INT,
                widget_id INT,
                stat_date DATETIME NOT NULL,
                duration INT DEFAULT 0,
                synced TINYINT DEFAULT 0,
                retry_count INT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (display_id),
                INDEX (synced),
                INDEX (stat_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('[Migration] Table "stat_buffer" ready.');

        // 2. Create offline_windows table
        await dbRun(`
            CREATE TABLE IF NOT EXISTS offline_windows (
                id INT PRIMARY KEY AUTO_INCREMENT,
                display_id INT NOT NULL,
                offline_start DATETIME NOT NULL,
                offline_end DATETIME NULL,
                stats_flushed TINYINT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX (display_id),
                INDEX (offline_end),
                INDEX (stats_flushed)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('[Migration] Table "offline_windows" ready.');

        // 3. Safe column addition for "screens" table
        const checkColumn = async (colName) => {
            const sql = `
                SELECT COUNT(*) as col_exists 
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'screens' 
                AND COLUMN_NAME = ?
            `;
            const result = await dbGet(sql, [colName]);
            return result.col_exists > 0;
        };

        if (!(await checkColumn('previous_status'))) {
            await dbRun('ALTER TABLE screens ADD COLUMN previous_status VARCHAR(50) NULL');
            console.log('[Migration] Added column "previous_status" to "screens" table.');
        }

        if (!(await checkColumn('last_sync'))) {
            await dbRun('ALTER TABLE screens ADD COLUMN last_sync DATETIME NULL');
            console.log('[Migration] Added column "last_sync" to "screens" table.');
        }

        console.log('[Migration] Offline backfill migration completed successfully.');
    } catch (err) {
        console.error('[Migration] Failed to execute migration:', err.message);
        // Do not exit(1) if called from server.js to allow app to attempt startup
        if (require.main === module) process.exit(1);
        throw err;
    }
}

// Run if called directly
if (require.main === module) {
    migrate();
}

module.exports = migrate;
