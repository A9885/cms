const { dbAll, dbRun } = require('../src/db/database');

async function sync() {
    console.log('[Sync] Starting data linking synchronization...');
    try {
        // 1. Sync from campaigns table
        const campaigns = await dbAll('SELECT DISTINCT creative_id, brand_id FROM campaigns WHERE creative_id IS NOT NULL AND brand_id IS NOT NULL');
        console.log(`[Sync] Found ${campaigns.length} campaign mappings.`);
        
        for (const c of campaigns) {
            await dbRun(
                'INSERT IGNORE INTO media_brands (mediaId, brand_id, status) VALUES (?, ?, "Approved")',
                [c.creative_id, c.brand_id]
            );
        }

        // 2. Sync from slots table (if mediaId is assigned)
        const slots = await dbAll('SELECT DISTINCT mediaId, brand_id FROM slots WHERE mediaId IS NOT NULL AND brand_id IS NOT NULL');
        console.log(`[Sync] Found ${slots.length} slot mappings.`);

        for (const s of slots) {
            await dbRun(
                'INSERT IGNORE INTO media_brands (mediaId, brand_id, status) VALUES (?, ?, "Approved")',
                [s.mediaId, s.brand_id]
            );
        }

        console.log('[Sync] Synchronization complete.');
        process.exit(0);
    } catch (err) {
        console.error('[Sync] Error:', err.message);
        process.exit(1);
    }
}

sync();
