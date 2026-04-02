require('dotenv').config();
const xiboService = require('./src/services/xibo.service');
const statsService = require('./src/services/stats.service');
const { dbAll } = require('./src/db/database');

async function testSystem() {
  console.log('--- STARTING SYSTEM INTEGRATION TEST ---\n');
  
  try {
    // 1. Check Displays
    console.log('[Test 1] Fetching Displays from API...');
    const displays = await xiboService.getDisplays();
    console.log(`Found ${displays.length} displays:`);
    displays.forEach(d => console.log(`- ${d.display} (ID: ${d.displayId}, Online: ${d.loggedIn})`));
    
    // 2. Check Database Alignment
    console.log('\n[Test 2] Checking Database Synchronization...');
    const screens = await dbAll('SELECT * FROM screens');
    const linked = screens.filter(s => s.xibo_display_id !== null);
    console.log(`Matched ${linked.length} / ${screens.length} screens to Xibo.`);
    linked.forEach(s => console.log(`- ${s.name} is now linked to Xibo ID ${s.xibo_display_id}`));

    // 3. Check Slot Management
    console.log('\n[Test 3] Verifying Provisioned Slots...');
    for (const s of linked) {
        const slots = await dbAll('SELECT COUNT(*) as count FROM slots WHERE displayId = ?', [s.xibo_display_id]);
        console.log(`- Display ${s.name} (Xibo ID: ${s.xibo_display_id}) has ${slots[0].count} slots provisioned.`);
    }

    // 4. Check Library and Placeholder
    console.log('\n[Test 4] Verifying Media Library and Placeholder...');
    const library = await xiboService.getLibrary();
    console.log(`Found ${library.length} items in library.`);
    const placeholderId = process.env.PLACEHOLDER_MEDIA_ID;
    const placeholder = library.find(m => String(m.mediaId) === String(placeholderId));
    if (placeholder) {
        console.log(`- Placeholder Media correctly found (ID: ${placeholderId}, Name: ${placeholder.name})`);
    } else {
        console.log(`- WARNING: Placeholder ID ${placeholderId} not found in current library list.`);
    }

    // 5. Test Live Snapshot
    console.log('\n[Test 5] Testing Stats Pipeline (Live Snapshot)...');
    const snapshot = await statsService.getLiveSnapshot();
    console.log('Live Snapshot keys (Display IDs):', Object.keys(snapshot));

    console.log('\n--- ALL TESTS COMPLETED ---');
  } catch (err) {
    console.error('\n!!! TEST FAILED !!!');
    console.error(err.message);
    process.exit(1);
  }
}

testSystem();
