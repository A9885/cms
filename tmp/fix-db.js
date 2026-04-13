const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'xibo_crm'
    });
    
    // Add email column manually so it is nullable or has unique defaults.
    try {
        await pool.query('ALTER TABLE `users` ADD COLUMN `email` VARCHAR(255)');
    } catch(e) {
        console.log('Column email might exist:', e.message);
    }
    
    // Set a dummy unique email for each user based on their ID
    await pool.query('UPDATE `users` SET `email` = CONCAT("user", id, "@signtral.com") WHERE `email` IS NULL OR `email` = ""');
    
    try {
        await pool.query('ALTER TABLE `users` ADD UNIQUE (`email`)');
        await pool.query('ALTER TABLE `users` MODIFY `email` VARCHAR(255) NOT NULL');
    } catch(e) {
        console.log('Error adding constraint:', e.message);
    }

    console.log('Updated users table manually.');
    process.exit(0);
}
run();
