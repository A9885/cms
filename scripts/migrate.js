const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
    };
    const dbName = process.env.DB_NAME || 'cms_db';

    console.log(`[Migration] Connecting to MySQL at ${dbConfig.host}:${dbConfig.port}...`);

    let connection;
    try {
        // Connect without database first to ensure it exists
        connection = await mysql.createConnection(dbConfig);
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.query(`USE \`${dbName}\``);

        const sqlPath = path.join(__dirname, '..', 'migrations', '001_init.sql');
        if (!fs.existsSync(sqlPath)) {
            throw new Error(`Migration file not found: ${sqlPath}`);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Split by semicolon but be careful with nested semicolons (though simple for this script)
        // A better way is to use a library or just run one by one if they are simple CREATE TABLEs
        // For 001_init.sql, we can split by -- or just run it as multiple statements if the driver allows
        
        console.log(`[Migration] Executing ${sqlPath}...`);
        
        // mysql2/promise doesn't support multiple statements by default for security
        // We'll enable it for the migration
        const migrationConnection = await mysql.createConnection({
            ...dbConfig,
            database: dbName,
            multipleStatements: true
        });

        await migrationConnection.query(sql);
        console.log('[Migration] Success! Database schema updated.');
        
        await migrationConnection.end();
    } catch (err) {
        console.error('[Migration] Failed:', err.message);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
