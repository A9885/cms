// Usage: node scripts/reset-admin.js <email> <new_password>
require('dotenv').config();
const { dbRun } = require('../src/db/database');

async function reset() {
    const email = process.argv[2];
    const newPassword = process.argv[3];

    if (!email || !newPassword) {
        console.log('Usage: node scripts/reset-admin.js <email> <new_password>');
        process.exit(1);
    }

    console.log(`[Reset] Updating credentials for ${email}...`);

    try {
        // Better Auth uses specific hashing logic
        const { hashPassword } = await import('@better-auth/utils/password');
        const hash = await hashPassword(newPassword);

        // 1. Update the primary user table (used for role/id lookups)
        const userUpdate = await dbRun("UPDATE users SET password_hash = ? WHERE email = ?", [hash, email]);
        
        // 2. Update the Better Auth account table (used for actual authentication)
        const accountUpdate = await dbRun("UPDATE account SET password = ? WHERE accountId = ?", [hash, email]);

        if (userUpdate.changes > 0 || accountUpdate.changes > 0) {
            console.log(`\n✅ SUCCESS: password for [${email}] updated.`);
            console.log(`   Internal ID updated: ${userUpdate.changes > 0}`);
            console.log(`   Auth Account updated: ${accountUpdate.changes > 0}`);
        } else {
            console.log(`\n❌ ERROR: User [${email}] not found in database.`);
            console.log(`   Make sure the email matches exactly.`);
        }
    } catch (err) {
        console.error('\n❌ FAILED to reset password:', err.message);
    }
    process.exit(0);
}

reset();
