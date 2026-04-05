const xiboService = require('../src/services/xibo.service');

async function debug() {
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const pad = (n) => n.toString().padStart(2, '0');
        const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        
        const params = { fromDt: format(thirtyDaysAgo), toDt: format(now), length: 10 };
        const mediaRes = await xiboService.getStats('media', params);
        console.log('Media Stats Sample:', JSON.stringify(mediaRes, null, 2));

        const widgetRes = await xiboService.getStats('widget', params);
        console.log('Widget Stats Sample:', JSON.stringify(widgetRes, null, 2));

        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

debug();
