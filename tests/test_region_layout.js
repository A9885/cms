require('dotenv').config();
const axios = require('axios');
const xiboService = require('./src/services/xibo.service');
const XIBO_BASE_URL = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');

async function run() {
    try {
        const headers = await xiboService.getHeaders();
        const layoutName = `SCREEN_1_TEST_LAYOUT4`;
        
        console.log(`Creating Layout: ${layoutName}...`);
        const cParams = new URLSearchParams();
        cParams.append('name', layoutName);
        cParams.append('resolutionId', 1);
        
        const nlRes = await axios.post(`${XIBO_BASE_URL}/api/layout`, cParams.toString(), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        const layoutId = nlRes.data.layoutId;
        console.log("Created. LayoutId:", layoutId);

        // Checkout layout
        await axios.post(`${XIBO_BASE_URL}/api/layout/checkout/${layoutId}`, "", {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        }).catch(() => {});

        console.log("Adding Region...");
        const rParams = new URLSearchParams();
        rParams.append('width', 1920);
        rParams.append('height', 1080);
        rParams.append('top', 0);
        rParams.append('left', 0);

        const regRes = await axios.post(`${XIBO_BASE_URL}/api/region/${layoutId}`, rParams.toString(), {
            headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        console.log("Region Response:", JSON.stringify(regRes.data, null, 2));

        // Let's get the playlistId from that region
        const drRes = await axios.get(`${XIBO_BASE_URL}/api/layout`, { headers, params: { layoutId, embed: 'regions,playlists' } });
        const layoutObj = drRes.data[0];
        console.log("Regions object:", JSON.stringify(layoutObj.regions, null, 2));
        
        // Clean up
        await axios.delete(`${XIBO_BASE_URL}/api/layout/${layoutId}`, {headers});
    } catch (e) {
        console.log(e.response?.data || e.message);
    }
}
run();
