require('dotenv').config();
const axios = require('axios');
const xiboService = require('./src/services/xibo.service');
const XIBO_BASE_URL = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');

async function run() {
    try {
        const headers = await xiboService.getHeaders();
        const displayId = 1;
        const mainLoopId = 8;
        const displayGroupId = 1;

        const layoutName = `SCREEN_${displayId}_MAIN_LAYOUT`;
        let campaignId = null;
        let layoutId = null;
    
        const lRes = await axios.get(`${XIBO_BASE_URL}/api/layout`, { headers, params: { layout: layoutName } });
        if (lRes.data && lRes.data.length > 0) {
            campaignId = lRes.data[0].campaignId;
            layoutId = lRes.data[0].layoutId;
            console.log("Layout already exists: ", layoutId);
        } else {
            console.log(`Creating Main Layout: ${layoutName}`);
            const cParams = new URLSearchParams();
            cParams.append('name', layoutName);
            const nlRes = await axios.post(`${XIBO_BASE_URL}/api/layout`, cParams.toString(), {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            layoutId = nlRes.data.layoutId;
            campaignId = nlRes.data.campaignId;
    
            // Checkout layout to ensure it's editable
            await axios.post(`${XIBO_BASE_URL}/api/layout/checkout/${layoutId}`, "", {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
            }).catch(() => {});
    
            const drRes = await axios.get(`${XIBO_BASE_URL}/api/layout`, { headers, params: { layoutId, embed: 'regions,playlists' } });
            const layoutObj = drRes.data[0];
            const defaultRegion = (layoutObj.regions || [])[0];
            const regionPlaylistId = defaultRegion?.playlists?.[0]?.playlistId;
            
            if (regionPlaylistId) {
                const createResp = await axios.post(`${XIBO_BASE_URL}/api/playlist/widget/subplaylist/${regionPlaylistId}`, "", {
                    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                const wId = createResp.data.widgetId;
                if (wId) {
                    const putParams = new URLSearchParams();
                    putParams.set('subPlaylists', JSON.stringify([{ playlistId: mainLoopId, spots: 1 }]));
                    await axios.put(`${XIBO_BASE_URL}/api/playlist/widget/${wId}`, putParams.toString(), {
                        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                }
            }
            
            // Publish layout
            await axios.post(`${XIBO_BASE_URL}/api/layout/publish/${layoutId}`, "", {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
            }).catch(() => {});
            console.log("Layout structured and published.");
        }
    
        // Schedule the Layout Campaign
        let syncId = displayGroupId;
    
        const schedResp = await axios.get(`${XIBO_BASE_URL}/api/schedule`, { headers, params: { displayGroupId: syncId } });
        const isScheduled = (schedResp.data || []).find(s => Number(s.eventTypeId) === 1 && String(s.campaignId) === String(campaignId));
        
        if (!isScheduled) {
            console.log(`Scheduling Main Layout for Display ${displayId} on Group ${syncId}...`);
            const now = new Date();
            const start = now.toISOString().replace('T', ' ').substring(0, 19);
            const end = "2036-01-01 00:00:00";
            
            const params = new URLSearchParams();
            params.append('eventTypeId', 1); // 1 = Campaign/Layout
            params.append('campaignId', campaignId);
            params.append('displayGroupIds[]', syncId);
            params.append('fromDt', start);
            params.append('toDt', end);
            params.append('isPriority', 0);
            params.append('displayOrder', 1);
    
            const sr = await axios.post(`${XIBO_BASE_URL}/api/schedule`, params.toString(), {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            console.log(`Schedule created successfully: EventID ${sr.data.eventId}`);
        } else {
            console.log(`Main Layout is already scheduled (EventID: ${isScheduled.eventId})`);
        }
    } catch (e) {
        console.log(e.response?.data || e.message);
    }
}
run();
