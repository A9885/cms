const axios = require('axios');
const xiboService = require('./src/services/xibo.service');
async function run() {
    try {
        const headers = await xiboService.getHeaders();
        // Xibo expects ISO format for dates, not unix epoch
        const dt = new Date();
        dt.setHours(dt.getHours() - 1); // 1 hour ago
        const fromDtStr = dt.toISOString().replace('T', ' ').substring(0, 19);
        console.log("Checking stats since: " + fromDtStr);

        const statsRes = await axios.get(xiboService.baseUrl + xiboService._apiPrefix + '/stat', {
            headers,
            params: { fromDt: fromDtStr, displayId: 3 }
        });
        
        const stats = statsRes.data || [];
        console.log('Total stats records found for display 3 in last hour: ' + stats.length);
        if (stats.length > 0) {
            console.log('Sample latest 3 stats:');
            // Show the last 3 most recent stat records
            const recent = stats.slice(-3);
            for (const s of recent) {
                console.log('  Type: ' + s.type + ', Media ID: ' + s.mediaId + ', Count: ' + s.count + ', Duration: ' + s.duration + ', from: ' + s.start + ', to: ' + s.end);
            }
        } else {
            console.log('No stats found yet. Android players upload stats in batches based on their "Statistics Collection Interval" (usually once every 30-60 minutes depending on Profile).');
        }
    } catch(e) {
        console.log('Error fetching stats: ' + (e.response ? JSON.stringify(e.response.data) : e.message));
    }
}
run();
