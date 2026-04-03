const { dbAll, dbGet } = require('../src/db/database');
const xiboService = require('../src/services/xibo.service');

async function testDashboard() {
  const brandId = 2; // Test Brand

  // 1. Fetch campaigns
  const campaigns = await dbAll('SELECT id, screen_id, creative_id FROM campaigns WHERE brand_id = ? AND status = "Active"', [brandId]);
  console.log('Active Campaigns:', campaigns.length);

  // 2. Plays
  const statsSummary = await require('./src/services/stats.service').getAllMediaStats();
  const myMediaIds = new Set(campaigns.map(c => c.creative_id));
  const totalPlays = statsSummary.reduce((sum, s) => {
      if (myMediaIds.has(s.mediaId)) return sum + (s.totalPlays || 0);
      return sum;
  }, 0);
  console.log('Total Plays for Brand 2:', totalPlays);

  process.exit(0);
}

testDashboard().catch(err => {
    console.error(err);
    process.exit(1);
});
