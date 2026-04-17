require('dotenv').config();
const xiboService = require('./src/services/xibo.service');
const statsService = require('./src/services/stats.service');

async function debugTime() {
    try {
        console.log('--- Server Time ---');
        console.log('Local:', new Date().toString());
        console.log('UTC:  ', new Date().toISOString());

        const now = new Date();
        const fromDt = statsService._formatLocal(new Date(now.getTime() - 3600000));
        const toDt = statsService._formatLocal(now);
        
        console.log('\n--- Requesting Stats ---');
        console.log('fromDt (local):', fromDt);
        console.log('toDt   (local):', toDt);

        const res = await xiboService.getStats('raw', { fromDt, toDt, length: 5 });
        const records = res.data || res || [];
        
        console.log('\n--- Raw Records from Xibo ---');
        records.forEach((r, i) => {
            console.log(`Record ${i}:`);
            console.log(`  start: ${r.start}`);
            console.log(`  end:   ${r.end}`);
            console.log(`  statDate: ${r.statDate}`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    }
}

debugTime();
