require('dotenv').config();
const xiboService = require('../src/services/xibo.service');

async function testConnection() {
    console.log('Testing Xibo Connection...');
    try {
        const diag = await xiboService.getHealth();
        console.log('Diagnostic result:', JSON.stringify(diag, null, 2));

        if (diag.status === 'connected') {
            const displays = await xiboService.getDisplays();
            console.log(`Found ${displays?.length} displays.`);
            if (displays && displays.length > 0) {
                console.log('Display 1:', displays[0].display);
            }
        }
    } catch (e) {
        console.error('Connection failed:', e.message);
    }
}

testConnection();
