require('dotenv').config();
const mysql = require('mysql2/promise');

async function test() {
    console.log('DB_HOST:', process.env.DB_HOST);
    console.log('DB_USER:', process.env.DB_USER);
    console.log('DB_NAME:', process.env.DB_NAME);
    
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || '127.0.0.1',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'xibo_crm'
        });
        console.log('Connected to MySQL successfully!');
        const [rows] = await connection.query('SELECT username, role FROM users');
        console.log('Users found:', rows.length);
        console.table(rows);
        await connection.end();
    } catch (err) {
        console.error('MySQL Connection Error:', err.message);
    }
}
test().then(() => process.exit());
