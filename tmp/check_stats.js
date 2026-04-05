require('dotenv').config();
const { dbAll } = require('../src/db/database');
async function run() {
    console.log(await dbAll(`SELECT * FROM daily_media_stats`));
}
run().then(() => process.exit());
