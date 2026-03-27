require('dotenv').config();
const xibo = require('../src/services/xibo.service');

async function check() {
    try {
        console.log('--- XIBO STATS CHECK ---');
        const now = new Date().toISOString().split('.')[0].replace('T', ' ');
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('.')[0].replace('T', ' ');
        
        console.log(`Searching from ${yesterday} to ${now}`);
        
        // Check general media stats
        const stats = await xibo.getStats('media', { fromDt: yesterday, toDt: now, length: 10 });
        console.log('Recent Media Stats Count:', stats.length);
        
        const lStats = await xibo.getStats('layout', { fromDt: yesterday, toDt: now, length: 10 });
        console.log('Recent Layout Stats Count:', lStats.length);
        
        if (stats.length > 0) {
            console.log('Latest Media Record:', JSON.stringify(stats[0], null, 2));
        }
        if (lStats.length > 0) {
            console.log('Latest Layout Record:', JSON.stringify(lStats[0], null, 2));
        }

        // Check if any displays are online
        const displays = await xibo.getDisplays();
        console.log('--- Displays ---');
        displays.forEach(d => {
            console.log(`${d.display} (ID: ${d.displayId}): LoggedIn=${d.isLoggedIn}, AuditingUntil=${d.auditingUntil || 'None'}`);
        });

        // Check Media ID 83 specifically
        console.log('--- Media Check (83) ---');
        const library = await xibo.getLibrary({ mediaId: 83 });
        if (library && library.length > 0) {
            const m = library[0];
            console.log(`Media 83: ${m.name}, enableStat=${m.enableStat}, deleted=${m.isDeleted}`);
        } else {
            console.log('Media 83 NOT FOUND in library.');
        }

    } catch (err) {
        console.error('Check failed:', err.message);
    }
}

check();
