require('dotenv').config();
const xibo = require('../src/services/xibo.service');

async function check() {
    try {
        console.log('--- GLOBAL NETWORK STATS AUDIT ---');
        const now = new Date().toISOString().split('.')[0].replace('T', ' ');
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('.')[0].replace('T', ' ');

        // Fetch absolute latest 20 records for ANY media/widget/display across whole network (parallelized)
        const types = ['media', 'widget', 'layout'];
        await Promise.all(types.map(async (type) => {
            console.log(`Checking type: ${type}...`);
            const stats = await xibo.getStats(type, { length: 20 }); 
            if (stats && stats.length > 0) {
                console.log(`Latest ${type} Record:`, stats[0].statDate || stats[0].start, `on Display: ${stats[0].display}`);
                // Find if any display has a record for March 24 or 25
                const recent = stats.find(s => (s.statDate || s.start || '').startsWith('2026-03-2'));
                if (recent) console.log(`>>> FOUND RECENT ${type} DATA:`, recent.statDate || recent.start);
            } else {
                console.log(`No records found for ${type}.`);
            }
        }));

        // Check Display Profile Global Stats setting
        const heads = await xibo.getHeaders();
        const profiles = await require('axios').get(xibo.baseUrl + '/api/displayprofile', { headers: heads }).catch(() => null);
        if (profiles) {
            console.log('Display Profiles Found:', profiles.data.length);
        }

    } catch (err) {
        console.error('Audit failed:', err.message);
    }
}

check();
