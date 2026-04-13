require('dotenv').config();
const axios = require('axios');
const xiboService = require('./src/services/xibo.service');
const XIBO_BASE_URL = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');

async function run() {
    const headers = await xiboService.getHeaders();

    // Step 1: Delete all current schedules
    console.log('=== Step 1: Clean up old schedules ===');
    const sRes = await axios.get(XIBO_BASE_URL + '/api/schedule', { headers });
    for (const s of (sRes.data || [])) {
        await axios.delete(XIBO_BASE_URL + '/api/schedule/' + s.eventId, { headers }).catch(() => {});
        console.log('Deleted schedule:', s.eventId, s.campaign);
    }

    // Step 2: Clean up orphan widgets in Main Loop (keep only Slot 1-20 Links)
    console.log('\n=== Step 2: Clean up Main Loop orphan widgets ===');
    const pRes = await axios.get(XIBO_BASE_URL + '/api/playlist', { headers, params: { name: 'SCREEN_1_MAIN_LOOP', embed: 'widgets' } });
    const ml = (pRes.data || []).find(p => (p.playlist || p.name) === 'SCREEN_1_MAIN_LOOP');
    const mainLoopId = ml?.playlistId;
    const widgets = ml?.widgets || [];
    
    // Identify orphan widgets (not named "Slot X: Link")
    const orphans = widgets.filter(w => !w.name || (!w.name.match(/^Slot \d+: Link$/) && w.name !== 'Slot 1: Link'));
    const slotLinks = widgets.filter(w => w.name && (w.name.match(/^Slot \d+: Link$/) || w.name === 'Slot 1: Link'));
    
    console.log('Total widgets:', widgets.length, '| Orphans:', orphans.length, '| Slot links:', slotLinks.length);
    
    for (const w of orphans) {
        await axios.delete(XIBO_BASE_URL + '/api/playlist/widget/' + w.widgetId, { headers }).catch(() => {});
        console.log('  Deleted orphan widget:', w.widgetId, w.name);
    }

    // Step 3: Schedule the MAIN_LOOP playlist using eventTypeId 8 (Playlist schedule)
    console.log('\n=== Step 3: Schedule Main Loop Playlist (eventTypeId: 8) ===');
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const sp = new URLSearchParams();
    sp.append('eventTypeId', 8);   // 8 = Playlist event type
    sp.append('playlistId', mainLoopId);
    sp.append('displayGroupIds[]', 1);
    sp.append('fromDt', now);
    sp.append('toDt', '2036-01-01 00:00:00');
    sp.append('isPriority', 1);
    sp.append('displayOrder', 1);

    const sr = await axios.post(XIBO_BASE_URL + '/api/schedule', sp.toString(), {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    console.log('Schedule created! EventID:', sr.data.eventId, '| campaign:', sr.data.campaign);

    // Step 4: Force display to download NOW
    console.log('\n=== Step 4: Force display sync ===');
    const cnRes = await axios.post(XIBO_BASE_URL + '/api/displaygroup/1/action/collectNow', '', {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(e => ({ data: e.response?.data }));
    console.log('Collect Now:', cnRes.data ? 'Sent!' : 'Failed');

    // Step 5: Request screenshot to verify
    await axios.put(XIBO_BASE_URL + '/api/display/requestscreenshot/1', null, { headers }).catch(() => {});
    console.log('Screenshot requested.');

    // Summary
    console.log('\n=== FINAL STATE ===');
    const finalSched = await axios.get(XIBO_BASE_URL + '/api/schedule', { headers });
    const display = await axios.get(XIBO_BASE_URL + '/api/display', { headers });
    console.log('Schedules:', finalSched.data.map(x => ({ id: x.eventId, type: x.eventTypeId, typeName: x.eventTypeName, from: x.displayFromDt })));
    console.log('Display loggedIn:', display.data[0]?.loggedIn, '| lastAccess:', display.data[0]?.lastAccessed);
    console.log('\nDone! The display should now cycle through all uploaded slot ads.');
}

run().catch(console.error);
