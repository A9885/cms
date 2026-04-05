const statsService = require('../src/services/stats.service');
const { dbAll } = require('../src/db/database');

async function verify() {
    console.log('[Verify] Manually triggering syncAllStats...');
    try {
        const result = await statsService.syncAllStats();
        console.log('[Verify] Sync result:', result);

        if (result.success) {
            const rowCount = await dbAll('SELECT COUNT(*) as count FROM daily_media_stats');
            console.log(`[Verify] daily_media_stats row count: ${rowCount[0].count}`);

            const topStats = await dbAll('SELECT * FROM daily_media_stats ORDER BY count DESC LIMIT 5');
            console.log('[Verify] Top Stats:', JSON.stringify(topStats, null, 2));
        }

        process.exit(0);
    } catch (err) {
        console.error('[Verify] Error:', err.message);
        process.exit(1);
    }
}

verify();
