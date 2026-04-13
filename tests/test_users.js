require('dotenv').config();
const { dbAll } = require('./src/db/database');
const bcrypt = require('bcryptjs');

async function check() {
    try {
        const users = await dbAll('SELECT id, username, role, force_password_reset, password_hash FROM users');
        console.log("Users in DB:");
        users.forEach(u => {
            let passStr = "Unknown";
            if (bcrypt.compareSync('admin123', u.password_hash)) passStr = 'admin123';
            if (bcrypt.compareSync('brand123', u.password_hash)) passStr = 'brand123';
            if (bcrypt.compareSync('Brand@123', u.password_hash)) passStr = 'Brand@123';
            if (bcrypt.compareSync('partner123', u.password_hash)) passStr = 'partner123';
            if (bcrypt.compareSync('Partner@123', u.password_hash)) passStr = 'Partner@123';
            
            console.log(`- [${u.role}] ${u.username} | PassMatches: ${passStr} | ForceReset: ${u.force_password_reset}`);
        });
    } catch(e) {
        console.error("FAIL:", e.message);
    }
    process.exit(0);
}
check();
