import { hashPassword } from '@better-auth/utils/password';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function resetAdmin() {
    const newPassword = "admin123";
    const passwordHash = await hashPassword(newPassword);
    
    console.log(`Generated Native Hash: ${passwordHash}`);

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'xibo_crm'
    });

    try {
        // Update both users and account table
        // We set displayUsername to 'admin' to ensure the username plugin finds it easily
        await connection.execute('UPDATE users SET password_hash = ?, displayUsername = "admin" WHERE id = 1', [passwordHash]);
        await connection.execute('UPDATE account SET password = ? WHERE userId = 1 AND providerId = "credential"', [passwordHash]);
        console.log("✅ Admin password and displayUsername updated using native @better-auth/utils hashing.");
    } catch (err) {
        console.error("Failed to update admin:", err);
    } finally {
        await connection.end();
    }
}

resetAdmin();
