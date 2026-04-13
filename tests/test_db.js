require('dotenv').config();
const { dbGet } = require('./src/db/database');

async function test() {
    console.log("Testing connection...");
    try {
        const adminUser = await dbGet("SELECT username, role FROM users WHERE username = 'admin'");
        if (adminUser) {
            console.log("✅ SUCCESS! Connected to MySQL and found admin user:", adminUser);
        } else {
            console.log("⚠️ WARNING: Connected to MySQL, but could not find admin user.");
        }
    } catch (e) {
        console.error("❌ TEST FAILED:", e.message);
        if (e.code === 'ECONNREFUSED') {
            console.error("Is MySQL running locally on port 3306?");
        } else if (e.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error("Access denied. Please check DB_USER and DB_PASSWORD in .env.");
        }
    }
    // allow time for async console logs
    setTimeout(() => process.exit(0), 1000);
}

test();
