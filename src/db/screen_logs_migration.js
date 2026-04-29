const { dbReady, dbRun } = require('./database');

async function runMigration() {
    await dbReady;
    console.log('[Migration] Creating screen_event_logs table...');

    try {
        await dbRun(`
            CREATE TABLE IF NOT EXISTS screen_event_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                screen_id INT NOT NULL,
                event_type VARCHAR(50) NOT NULL, -- 'status_change', 'slot_update', 'sync', 'provisioning'
                details TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_screen_event (screen_id, event_type),
                INDEX idx_created_at (created_at)
            )
        `);
        console.log('[Migration] screen_event_logs table created successfully.');
    } catch (err) {
        console.error('[Migration] Failed to create screen_event_logs table:', err.message);
    }
}

if (require.main === module) {
    runMigration().then(() => process.exit(0));
}

module.exports = runMigration;
