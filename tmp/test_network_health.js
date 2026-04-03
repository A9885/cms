require('dotenv').config({ path: '../.env' });
const xiboService = require('../src/services/xibo.service');


async function testHealth() {
    try {
        const displays = await xiboService.getDisplays();
        const healthStats = displays.map(d => xiboService.getDisplayHealth(d));
        
        console.log('Network Health Summary:');
        console.log('Total Displays:', healthStats.length);
        console.log('Online:', healthStats.filter(h => h.status === 'Online').length);
        console.log('Offline:', healthStats.filter(h => h.status === 'Offline').length);
        console.log('Stale:', healthStats.filter(h => h.status === 'Stale').length);
        
        healthStats.forEach(h => {
            console.log(`- ${h.name} (${h.status}) | IP: ${h.ip} | v${h.version} | Storage: ${h.storage.freeGB} GB Free`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testHealth();
