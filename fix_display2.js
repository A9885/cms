require('dotenv').config();
const axios = require('axios');
const xiboService = require('./src/services/xibo.service');
const XIBO_BASE_URL = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');
const mainLoopId = 8; // SCREEN_1_MAIN_LOOP playlist
const PLACEHOLDER_MEDIA_ID = parseInt(process.env.PLACEHOLDER_MEDIA_ID || '1');

async function run() {
    const headers = await xiboService.getHeaders();

    // Use fullscreen with id=mediaId type=media (this is what the existing upload route uses)
    console.log('Creating fullscreen layout wrapping playlist media...');
    
    // First, let's check what media IDs we have
    const mediaRes = await axios.get(`${XIBO_BASE_URL}/api/library`, { headers, params: { length: 10 } });
    console.log('Available media:', mediaRes.data.map(m => ({ id: m.mediaId, name: m.name, type: m.mediaType })));

    if (mediaRes.data.length === 0) {
        console.log('No media in library! Need to upload at least one image first.');
        return;
    }

    const firstMediaId = mediaRes.data[0].mediaId;
    console.log('\nUsing mediaId:', firstMediaId);

    const fsParams = new URLSearchParams();
    fsParams.append('id', firstMediaId);
    fsParams.append('type', 'media');
    fsParams.append('backgroundColor', '#000000');

    const fsRes = await axios.post(`${XIBO_BASE_URL}/api/layout/fullscreen`, fsParams.toString(), {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(e => { console.log('Fullscreen err:', JSON.stringify(e.response?.data)); return null; });

    if (!fsRes?.data?.layoutId) {
        console.log('Fullscreen layout creation failed.');
        return;
    }

    const layoutId = fsRes.data.layoutId;
    const campaignId = fsRes.data.campaignId;
    console.log('Layout created! layoutId:', layoutId, 'campaignId:', campaignId);

    // Schedule it
    console.log('Scheduling...');
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

    // Trigger collect now
    await axios.post(`${XIBO_BASE_URL}/api/displaygroup/1/action/collectNow`, '', {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(() => {});
    console.log('\nDisplay sync triggered. Ad should show shortly!');
}

run().catch(console.error);
