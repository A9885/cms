const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const args = process.argv.slice(2);
const IS_FRESH = args.includes('--fresh');

async function migrate() {
    const dbConfig = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
    };
    const dbName = process.env.DB_NAME || 'xibo_crm';

    console.log(`\n[Migration] 🚀 Starting Database Setup...`);
    console.log(`[Migration] Target: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbName}`);

    let connection;
    try {
        // 1. Initial Connection
        connection = await mysql.createConnection(dbConfig);

        // 2. Clear Database if --fresh is set
        if (IS_FRESH) {
            console.warn(`[Migration] ⚠️  --fresh flag detected. Dropping database "${dbName}"...`);
            await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        }

        // 3. Ensure Database Exists
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
        await connection.query(`USE \`${dbName}\``);
        await connection.end();

        // 4. Run Migrations
        // We prioritze mysql_schema.sql for fresh installs as it is the most comprehensive,
        // then run any incremental updates if needed.
        const migrationsDir = path.join(__dirname, '..', 'migrations');
        const migrationFiles = [
            'mysql_schema.sql',      // Full Base Schema
            '001_init.sql',          // Fallback / Initial
            '002_subscriptions.sql'  // Incremental Update
        ];

        const connectionForSchema = await mysql.createConnection({
            ...dbConfig,
            database: dbName,
            multipleStatements: true
        });

        for (const file of migrationFiles) {
            const sqlPath = path.join(migrationsDir, file);
            if (fs.existsSync(sqlPath)) {
                console.log(`[Migration] 📂 Applying ${file}...`);
                const sql = fs.readFileSync(sqlPath, 'utf8');
                try {
                    await connectionForSchema.query(sql);
                    console.log(`[Migration] ✅ ${file} applied successfully.`);
                } catch (err) {
                    // Ignore "already exists" errors for IF NOT EXISTS queries
                    if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_TABLE_EXISTS_ERROR') {
                        console.log(`[Migration] ℹ️  ${file}: Some elements already exist, skipping duplicates.`);
                    } else {
                        throw err;
                    }
                }
            }
        }

        console.log('\n[Migration] 🎉 Database setup complete!');
        await connectionForSchema.end();

    } catch (err) {
        console.error('\n[Migration] ❌ Setup FAILED:');
        console.error(`   Error: ${err.message}`);
        console.error(`   Check your .env settings and MySQL status.\n`);
        process.exit(1);
    }
}

migrate();

