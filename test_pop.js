require('dotenv').config();
const stats = require('./src/services/stats.service');

async function testPoP() {
    try {
        console.log("Fetching Recent PoP Records...");
        const recent = await stats.getRecentStats();
        console.log(`Total Recent PoP Records: ${recent.total}`);
        if(recent.data.length > 0) {
            console.log("Sample PoP Records:");
            console.dir(recent.data.slice(0, 5), { depth: null });
        }
    } catch(e) {
        console.error("Failed:", e.message);
    }
}
testPoP();
