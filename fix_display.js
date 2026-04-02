require('dotenv').config();
const axios = require('axios');
const xiboService = require('./src/services/xibo.service');
const XIBO_BASE_URL = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');
const mainLoopId = 8; // SCREEN_1_MAIN_LOOP playlist

async function run() {
    const headers = await xiboService.getHeaders();

    // Clean up all draft/test layouts except Default Layout (id 1)
    const lRes = await axios.get(`${XIBO_BASE_URL}/api/layout`, { headers });
    for (const l of lRes.data) {
        if (l.layoutId !== 1) {
            console.log(`Deleting layout ${l.layoutId} (${l.layout})...`);
            await axios.delete(`${XIBO_BASE_URL}/api/layout/${l.layoutId}`, { headers }).catch(e => {
                console.log(`  Failed to delete: ${e.response?.data?.message}`);
            });
        }
    }

    // Delete all schedules
    const sRes = await axios.get(`${XIBO_BASE_URL}/api/schedule`, { headers });
    for (const s of (sRes.data || [])) {
        console.log(`Deleting schedule ${s.eventId}...`);
        await axios.delete(`${XIBO_BASE_URL}/api/schedule/${s.eventId}`, { headers }).catch(() => {});
    }

    // Now create a fresh layout using the fullscreen API (Xibo has a built-in fullscreen layout endpoint)
    console.log('\nCreating fullscreen layout via /api/layout/fullscreen...');
    const fsParams = new URLSearchParams();
    fsParams.append('name', 'SCREEN_1_MAIN_LAYOUT');
    fsParams.append('resolutionId', 1);
    fsParams.append('playlistId', mainLoopId);

    const fsRes = await axios.post(`${XIBO_BASE_URL}/api/layout/fullscreen`, fsParams.toString(), {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(e => { console.log('Fullscreen layout err:', JSON.stringify(e.response?.data)); return null; });

    console.log('Fullscreen layout result:', JSON.stringify(fsRes?.data, null, 2));

    if (fsRes?.data?.layoutId) {
        const layoutId = fsRes.data.layoutId;
        const campaignId = fsRes.data.campaignId;
        console.log('\nCreating schedule for campaign', campaignId, '...');
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        const params = new URLSearchParams();
        params.append('eventTypeId', 1);
        params.append('campaignId', campaignId);
        params.append('displayGroupIds[]', 1);
        params.append('fromDt', now);
        params.append('toDt', '2036-01-01 00:00:00');
        params.append('isPriority', 1);
        params.append('displayOrder', 1);

        const sr = await axios.post(`${XIBO_BASE_URL}/api/schedule`, params.toString(), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        console.log('Schedule created! EventID:', sr.data.eventId);

        // Send collect now to the display
        console.log('\nTriggering display sync...');
        await axios.post(`${XIBO_BASE_URL}/api/displaygroup/1/action/collectNow`, '', {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(() => {});
        console.log('Done! Your ads should appear on the display shortly.');
    }
}

run().catch(console.error);
