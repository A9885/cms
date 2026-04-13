const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { dbAll, dbRun } = require('../src/db/database');

async function fix() {
    console.log('--- Starting Account Fix Script ---');
    try {
        const { hashPassword } = await import('@better-auth/utils/password');
        
        // 1. Clear existing credential accounts to avoid duplicates/collation issues
        console.log('Clearing old credential accounts...');
        await dbRun("DELETE FROM account WHERE providerId = 'credential'");

        const users = await dbAll('SELECT id, email, username FROM users');
        console.log(`Found ${users.length} users to check.`);
        
        for (const user of users) {
            const email = user.email || user.username;
            if (!email || !email.includes('@')) {
                console.log(`Skipping user ID ${user.id} (${user.username}) - no valid email.`);
                continue;
            }

            // Set a default password
            let defaultPwd = 'Partner@123';
            if (user.username === 'admin') defaultPwd = 'admin123';
            else if (email.includes('test')) defaultPwd = 'Brand@123';
            
            const hash = await hashPassword(defaultPwd);
            
            try {
                // Better Auth typical account table entry
                const accountId = email; 
                const id = `acc_${user.id}`;
                await dbRun(
                    "INSERT INTO account (id, userId, providerId, accountId, password) VALUES (?, ?, 'credential', ?, ?)",
                    [id, user.id, email, hash]
                );
                console.log(`✅ Synced account for: ${email} (Password: ${defaultPwd})`);
            } catch (e) {
                console.error(`❌ Failed for ${email}:`, e.message);
            }
        }
    } catch (err) {
        console.error('Fatal error in fix script:', err.message);
    }
    console.log('--- Account Fix Script Complete ---');
    process.exit(0);
}
fix();
