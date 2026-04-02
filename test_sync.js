require('dotenv').config();
const { dbGet } = require('./src/db/database');
const xiboService = require('./src/services/xibo.service');

async function run() {
    console.log("Testing synchronizeMainLoop (fixing 429)...");
    try {
        // We will just invoke the function exported from server.js. Wait, synchronizeMainLoop is not exported.
        // I will copy the exact loop to test it dynamically.
        const displayId = 1; // HYD-MALL-01 is Display 1.
        const headers = await xiboService.getHeaders();
        const mainLoopName = `SCREEN_${displayId}_MAIN_LOOP`;
        console.log(`Checking/Creating ${mainLoopName}...`);
        
        // This simulates the fixed logic in server.js
        const axios = require('axios');
        const XIBO_BASE_URL = (process.env.XIBO_BASE_URL || '').replace(/\/$/, '');
        let mainLoopId = null;
        
        const pResp = await axios.get(`${XIBO_BASE_URL}/api/playlist`, { headers, params: { name: mainLoopName } });
        if (pResp.data && pResp.data.length > 0) {
            mainLoopId = pResp.data[0].playlistId;
            console.log(`Main loop found: ${mainLoopId}`);
        } else {
            console.log("Main loop not found. Creating...");
            const createParams = new URLSearchParams();
            createParams.append('name', mainLoopName);
            const createResp = await axios.post(`${XIBO_BASE_URL}/api/playlist`, createParams.toString(), {
                headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            mainLoopId = createResp.data.playlistId;
        }

        console.log(`Starting sequential slot resolution...`);
        for (let i = 1; i <= 20; i++) {
            const slotName = `SCREEN_${displayId}_SLOT_${i}_PLAYLIST`;
            const check = await axios.get(`${XIBO_BASE_URL}/api/playlist`, { headers, params: { name: slotName } });
            if (check.data && check.data.length > 0) {
                console.log(`[Slot ${i}] Verified: ${check.data[0].playlistId}`);
            } else {
                console.log(`[Slot ${i}] Not found. Creating...`);
                const cp = new URLSearchParams(); cp.append('name', slotName);
                await axios.post(`${XIBO_BASE_URL}/api/playlist`, cp.toString(), {
                    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                console.log(`[Slot ${i}] Created!`);
            }
        }
        
        console.log("All slots resolved without hitting 429 Rate Limit!");
    } catch(err) {
        console.error("Test failed:", err.response?.data || err.message);
    }
}
run();
