require('dotenv').config();
const { dbAll } = require('../src/db/database');
async function run() {
    const users = await dbAll('SELECT id, username, role, brand_id, partner_id FROM users');
    console.table(users);
}
run().then(() => process.exit());
