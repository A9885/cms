require('dotenv').config();
const path = require('path');
const screenService = require('../src/services/screen.service');
const db = require('../src/db/database');

async function testSync() {
    console.log('--- Testing Location Sync with Fixed Guard ---');
    try {
        await screenService.syncAllLocations();
        
        const results = await db.dbAll("SELECT screen_id, latitude, longitude, location_source, is_fixed_location FROM screens WHERE screen_id = 'HYD-MALL-01'");
        console.log('HYD-MALL-01 Final State:', JSON.stringify(results[0], null, 2));
    } catch (e) {
        console.error('Sync Error:', e.message);
    }
    process.exit();
}

testSync();
