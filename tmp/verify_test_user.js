const { getPool } = require('./src/db/database');
const { hashPassword, verifyPassword } = require('@better-auth/utils/password');

async function test() {
    const pool = await getPool();
    const [rows] = await pool.query("SELECT * FROM users WHERE email = 'test@gmail.com'");
    if (rows.length === 0) {
        console.log("User test@gmail.com NOT FOUND in users table");
        return;
    }
    const user = rows[0];
    console.log("User in 'users' table:", { id: user.id, email: user.email, role: user.role });

    const [accounts] = await pool.query("SELECT * FROM account WHERE userId = ?", [user.id]);
    if (accounts.length === 0) {
        console.log("NO account record found in 'account' table for this user!");
    } else {
        const acc = accounts[0];
        console.log("Account record:", { 
            id: acc.id, 
            providerId: acc.providerId, 
            accountId: acc.accountId,
            passwordHash: acc.password.substring(0, 10) + "..."
        });
        
        // Let's verify password 'Brand@123'
        const isMatch = await verifyPassword({
            hash: acc.password,
            password: 'Brand@123'
        });
        console.log("Does 'Brand@123' match the hash in 'account'?:", isMatch);
    }
    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
