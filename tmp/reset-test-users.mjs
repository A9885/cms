import { hashPassword } from '@better-auth/utils/password';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function resetAllTestUsers() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'xibo_crm'
    });

    const testUsers = [
        { username: 'admin', password: 'admin123' },
        { username: 'test@gmail.com', password: 'brand123' },
        { username: 'partner@signtral.com', password: 'partner123' }
    ];

    try {
        for (const u of testUsers) {
            console.log(`Resetting ${u.username}...`);
            const hash = await hashPassword(u.password);
            
            // Update displayUsername to match username for the plugin
            await connection.execute(
                'UPDATE users SET password_hash = ?, displayUsername = ? WHERE username = ?',
                [hash, u.username, u.username]
            );
            
            // Get user ID
            const [rows] = await connection.execute('SELECT id FROM users WHERE username = ?', [u.username]);
            if (rows.length > 0) {
                const userId = rows[0].id;
                await connection.execute(
                    'UPDATE account SET password = ? WHERE userId = ? AND providerId = "credential"',
                    [hash, userId]
                );
                console.log(`✅ ${u.username} reset successfully.`);
            }
        }
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await connection.end();
    }
}

resetAllTestUsers();
