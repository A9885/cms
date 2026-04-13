import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function adoptUsers() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'xibo_crm'
    });

    try {
        console.log('Fetching users to adopt...');
        const [users] = await connection.execute('SELECT id, username, email, password_hash FROM users');

        for (const user of users) {
            console.log(`Adopting user: ${user.username} (ID: ${user.id})...`);
            
            // Check if account already exists
            const [existing] = await connection.execute('SELECT id FROM account WHERE userId = ? AND providerId = "credential"', [user.id]);
            
            if (existing.length === 0) {
                await connection.execute(
                    'INSERT INTO account (accountId, providerId, userId, password, updatedAt) VALUES (?, ?, ?, ?, ?)',
                    [
                        user.id.toString(), // accountId can be userId for credentials
                        'credential',
                        user.id,
                        user.password_hash,
                        new Date()
                    ]
                );
                console.log(`✅ User ${user.username} adopted successfully.`);
            } else {
                console.log(`ℹ️ User ${user.username} already has an account record.`);
            }
        }
        
        console.log('Migration complete!');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

adoptUsers();
