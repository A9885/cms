require('dotenv').config();
const axios = require('axios');
const xiboService = require('./src/services/xibo.service');
const XIBO_BASE_URL = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');
const mainLoopId = 8;

async function buildProperLayout() {
    const headers = await xiboService.getHeaders();
    const layoutName = `SCREEN_1_MAIN_LAYOUT`;

    // Delete old broken layout first
    const oldRes = await axios.get(`${XIBO_BASE_URL}/api/layout`, { headers, params: { layout: layoutName } });
    for (const l of (oldRes.data || [])) {
        console.log(`Deleting old layout ${l.layoutId}...`);
        await axios.delete(`${XIBO_BASE_URL}/api/layout/${l.layoutId}`, { headers }).catch(() => {});
    }

    // Step 1: Create layout
    console.log("Creating layout...");
    const cParams = new URLSearchParams();
    cParams.append('name', layoutName);
    cParams.append('resolutionId', 1);
    const nlRes = await axios.post(`${XIBO_BASE_URL}/api/layout`, cParams.toString(), {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const layoutId = nlRes.data.layoutId;
    console.log("layoutId:", layoutId, "campaignId:", nlRes.data.campaignId);

    // Step 2: Checkout to make it a draft (editable)
    console.log("Checking out layout...");
    const coRes = await axios.post(`${XIBO_BASE_URL}/api/layout/checkout/${layoutId}`, "", {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(e => { console.log("Checkout already done or failed:", e.response?.data); return null; });

    // Use the checked-out layoutId (it may create a new draft layout)
    const draftLayoutId = coRes?.data?.layoutId || layoutId;
    const campaignId = coRes?.data?.campaignId || nlRes.data.campaignId;
    console.log("Draft layoutId:", draftLayoutId, "campaignId:", campaignId);

    // Step 3: Add a full-screen region
    console.log("Adding region...");
    const rParams = new URLSearchParams();
    rParams.append('width', 1920);
    rParams.append('height', 1080);
    rParams.append('top', 0);
    rParams.append('left', 0);
    const regRes = await axios.post(`${XIBO_BASE_URL}/api/region/${draftLayoutId}`, rParams.toString(), {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const regionPlaylistId = regRes.data.regionPlaylist?.playlistId;
    const regionId = regRes.data.regionId;
    console.log("regionId:", regionId, "regionPlaylistId:", regionPlaylistId);

    // Step 4: Add SubPlaylist widget pointing to our MAIN_LOOP
    if (regionPlaylistId) {
        console.log("Adding SubPlaylist widget to region...");
        const wpRes = await axios.post(`${XIBO_BASE_URL}/api/playlist/widget/subplaylist/${regionPlaylistId}`, "", {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const widgetId = wpRes.data.widgetId;
        console.log("widgetId:", widgetId);

        if (widgetId) {
            const putParams = new URLSearchParams();
            putParams.set('subPlaylists', JSON.stringify([{ playlistId: mainLoopId, spots: 1 }]));
            putParams.set('name', 'Main Loop');
            await axios.put(`${XIBO_BASE_URL}/api/playlist/widget/${widgetId}`, putParams.toString(), {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            console.log("SubPlaylist linked to Main Loop (playlist 8).");
        }
    }

    // Step 5: Publish layout
    console.log("Publishing layout...");
    const pubRes = await axios.post(`${XIBO_BASE_URL}/api/layout/publish/${draftLayoutId}`, "ageContent=1", {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(e => { console.log("Publish error:", e.response?.data); return null; });
    
    const publishedLayoutId = pubRes?.data?.layoutId || draftLayoutId;
    const publishedCampaignId = pubRes?.data?.campaignId || campaignId;
    console.log("Published. publishedLayoutId:", publishedLayoutId, "campaignId:", publishedCampaignId);

    // Step 6: Create schedule
    console.log("Creating schedule...");
    const now = new Date();
    const start = now.toISOString().replace('T', ' ').substring(0, 19);
    const schedParams = new URLSearchParams();
    schedParams.append('eventTypeId', 1);
    schedParams.append('campaignId', publishedCampaignId);
    schedParams.append('displayGroupIds[]', 1);
    schedParams.append('fromDt', start);
    schedParams.append('toDt', '2036-01-01 00:00:00');
    schedParams.append('isPriority', 0);
    schedParams.append('displayOrder', 1);

    const sRes = await axios.post(`${XIBO_BASE_URL}/api/schedule`, schedParams.toString(), {
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    console.log("Schedule created! EventID:", sRes.data.eventId);

    // Step 7: Wake up display
    console.log("Waking up display...");
    await axios.post(`${XIBO_BASE_URL}/api/display/wakeOnLan/1`, "", { headers }).catch(() => {});
    await axios.post(`${XIBO_BASE_URL}/api/displaygroup/1/action/collectNow`, "", { 
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
    }).catch(() => {});
    console.log("Done! Display should sync the new schedule shortly.");
}

buildProperLayout().catch(console.error);
