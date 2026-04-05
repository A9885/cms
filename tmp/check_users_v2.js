require('dotenv').config();
const { dbAll, dbReady } = require('../src/db/database');

async function run() {
    console.log('[Check] Waiting for DB initialization...');
    await dbReady;
    console.log('[Check] DB Ready. Querying users...');
    try {
        const users = await dbAll('SELECT id, username, role, brand_id, partner_id FROM users');
        const partners = await dbAll('SELECT id, name, email FROM partners');
        const brands = await dbAll('SELECT id, name, email FROM brands');
        
        console.log('\n--- USERS ---');
        console.table(users);
        console.log('\n--- PARTNERS ---');
        console.table(partners);
        console.log('\n--- BRANDS ---');
        console.table(brands);
    } catch (err) {
        console.error('[Check] Query failed:', err.message);
    }
}
run().then(() => process.exit());
