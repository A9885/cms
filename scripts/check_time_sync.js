require('dotenv').config();
const xiboService = require('../src/services/xibo.service');

async function checkSync() {
    console.log('--- Time Synchronization Diagnostic ---');
    try {
        const offset = await xiboService.getClockOffset();
        const serverTime = new Date();
        const xiboTime = new Date(serverTime.getTime() + offset);

        console.log(`Local Server Time : ${serverTime.toISOString()}`);
        console.log(`Xibo CMS Time     : ${xiboTime.toISOString()}`);
        console.log(`Calculated Drift  : ${Math.round(offset / 1000)} seconds (${Math.round(offset / 1000 / 60)} minutes)`);
        
        if (Math.abs(offset) > 300000) {
            console.log('\n⚠️  WARNING: High drift detected (> 5 mins). Normalization is active.');
        } else {
            console.log('\n✅ Clock sync is healthy.');
        }

    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkSync();
