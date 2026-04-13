const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { dbRun } = require('../src/db/database');

async function migrate() {
    console.log('--- Starting Schema Migration Script ---');
    const queries = [
        "ALTER TABLE account MODIFY updatedAt timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
        "ALTER TABLE session MODIFY updatedAt timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
        "ALTER TABLE verification MODIFY updatedAt timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)",
        "ALTER TABLE users MODIFY displayUsername varchar(255) DEFAULT NULL"
    ];

    for (const query of queries) {
        try {
            await dbRun(query);
            console.log(`✅ Success: ${query.substring(0, 50)}...`);
        } catch (e) {
            console.error(`❌ Failed: ${query.substring(0, 50)}...`, e.message);
        }
    }
    console.log('--- Schema Migration Script Complete ---');
    process.exit(0);
}
migrate();
