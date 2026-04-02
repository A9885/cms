const xiboService = require('./src/services/xibo.service');

async function checkCommands() {
    try {
        const headers = await xiboService.getHeaders();
        const axios = require('axios');
        const base = process.env.XIBO_BASE_URL;
        
        console.log('--- FETCHING COMMANDS ---');
        const resp = await axios.get(`${base}/api/command?length=100`, { headers });
        const commands = resp.data.map(c => ({ id: c.commandId, name: c.command, code: c.code }));
        console.log(JSON.stringify(commands, null, 2));
        
        console.log('\n--- FETCHING DISPLAY PROFILES ---');
        const profileResp = await axios.get(`${base}/api/displayprofile?length=50`, { headers });
        const profiles = profileResp.data.map(p => ({ id: p.displayProfileId, name: p.name, type: p.type }));
        console.log(JSON.stringify(profiles, null, 2));

    } catch (e) {
        console.error('FAILED:', e.response?.data || e.message);
    }
}

checkCommands();
