const xiboService = require('./src/services/xibo.service');
const axios = require('axios');

(async () => {
    try {
        const headers = await xiboService.getHeaders();
        // Get the display with ID 2
        const res = await axios.get(`https://cms.signtral.info/api/display/2?embed=fault`, { headers });
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error(e.response ? e.response.data : e.message);
    }
})();
