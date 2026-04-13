const { dbRun, dbGet } = require('./src/db/database');
(async () => {
    try {
        console.log("Ready");
        const email = 'test001@gmail.com';
        const password = 'Password123';
        const { hashPassword } = await import('@better-auth/utils/password');
        const hash = await hashPassword(password);
        console.log("Hash done");
        
        // 1. Create or update user
        await dbRun(
            `INSERT INTO users (username, email, password_hash, role, partner_id, force_password_reset) 
             VALUES (?, ?, ?, 'Partner', ?, 1)
             ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id), role = VALUES(role), password_hash = VALUES(password_hash)`,
            [email, email, hash, 999]
        );
        console.log("User updated");

        const user = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
        const userId = user ? user.id : null;
        console.log("User ID:", userId);

        if (userId) {
            await dbRun(
                `INSERT INTO account (id, userId, providerId, accountId, password) 
                 VALUES (?, ?, 'credential', ?, ?)
                 ON DUPLICATE KEY UPDATE password = VALUES(password)`,
                [`acc_${userId}`, userId, email, hash]
            );
        }
        console.log("Done");
        process.exit(0);
    } catch(e) {
        console.error("FAILED:", e.message);
        process.exit(1);
    }
})();
