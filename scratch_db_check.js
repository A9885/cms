require('dotenv').config();
const { dbGet, dbAll } = require('./src/db/database');

async function check() {
    try {
        const brands = await dbAll('SELECT * FROM brands');
        console.log('Brands:', brands);
        const users = await dbAll("SELECT id, username, email, role FROM users WHERE role = 'Brand'");
        console.log('Brand Users:', users);
        const accounts = await dbAll("SELECT userId, accountId, providerId FROM account");
        console.log('Accounts:', accounts);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
