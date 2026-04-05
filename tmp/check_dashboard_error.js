require('dotenv').config();
const { dbAll } = require('../src/db/database');
const xiboService = require('../src/services/xibo.service');
const statsService = require('../src/services/stats.service');

async function check() {
    try {
        const brandId = 1; // Assuming test brand

        const [campaigns, brandMedia, statsSummary] = await Promise.all([
            dbAll('SELECT id, screen_id, creative_id, status FROM campaigns WHERE brand_id = ?', [brandId]),
            dbAll('SELECT mediaId FROM media_brands WHERE brand_id = ?', [brandId]),
            statsService.getAllMediaStats()
        ]);
        
        console.log('campaigns', campaigns);

        const screenIds = [...new Set(campaigns.map(c => c.screen_id))];
        let brandScreens = [];
        if (screenIds.length > 0) {
            const placeholders = screenIds.map(() => '?').join(',');
            brandScreens = await dbAll(`SELECT xibo_display_id as displayId, name, latitude, longitude, status FROM screens WHERE xibo_display_id IN (${placeholders})`, screenIds);
        }

        const myMediaIds = new Set(brandMedia.map(bm => String(bm.mediaId)));
        const totalPlays = statsSummary.reduce((sum, s) => {
            if (myMediaIds.has(String(s.mediaId))) return sum + (s.totalPlays || 0);
            return sum;
        }, 0);

        console.log('totalPlays', totalPlays);
    } catch (e) {
        console.error('ERROR:', e);
    }
}
check().then(() => process.exit());
