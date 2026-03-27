require('dotenv').config();
const xibo = require('../src/services/xibo.service');

async function check() {
    try {
        console.log('--- Media 83 Historical Check ---');
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('.')[0].replace('T', ' ');
        const now = new Date().toISOString().split('.')[0].replace('T', ' ');

        const hStats = await xibo.getStats('media', { 
            'mediaId[]': [83], 
            fromDt: thirtyDaysAgo, 
            toDt: now, 
            length: 100 
        });
        
        console.log('Total History Records for Media 83:', hStats.length);
        if (hStats.length > 0) {
            console.log('Absolute Latest Play for Media 83:', hStats[0].statDate || hStats[0].start);
            console.log('Full First Record:', JSON.stringify(hStats[0], null, 2));
        } else {
            console.log('No historical stats found for Media 83.');
        }

        // Check if layout stats also exist for this media's layout
        // (We might need to find which layout media 83 is in)
        const library = await xibo.getLibrary({ mediaId: 83 });
        console.log('Media Name:', library[0]?.name);


        // Check Display Sync Status
        const displays = await xibo.getDisplays();
        displays.forEach(d => {
            console.log(`Display ${d.display}: LastAccessed=${d.lastAccessed}, isLoggedIn=${d.isLoggedIn}`);
        });

    } catch (err) {
        console.error('Check failed:', err.message);
    }
}

check();
