require('dotenv').config();
const xiboService = require('./src/services/xibo.service');

async function testClock() {
    try {
        const headers = await xiboService.getHeaders();
        const start = Date.now();
        const res = await require('axios').get(`${xiboService.baseUrl}${xiboService._apiPrefix}/clock`, { headers });
        const end = Date.now();
        
        console.log('Xibo Response:', res.data);
        console.log('Signtral Time (Start):', new Date(start).toISOString());
        console.log('Signtral Time (End):  ', new Date(end).toISOString());

    } catch (err) {
        console.error('Error:', err.message);
    }
}

testClock();
