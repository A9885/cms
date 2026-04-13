const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
};
const dbName = process.env.DB_NAME || 'xibo_crm';

let pool;

const getPool = async () => {
    if (pool) return pool;
    try {
        pool = mysql.createPool({ ...dbConfig, database: dbName });
        await pool.query('SELECT 1'); // Test connection
    } catch (err) {
        if (err.code === 'ER_BAD_DB_ERROR') {
            console.log(`[DB] Database ${dbName} not found. Creating it...`);
            const tempConn = await mysql.createConnection(dbConfig);
            await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
            await tempConn.end();
            pool = mysql.createPool({ ...dbConfig, database: dbName });
        } else {
            console.error('[DB] Database connection failed:', err.message);
            // Don't throw here to prevent server crash during boot if MySQL is offline
        }
    }
    return pool;
};

async function initSchema() {
    try {
        const p = await getPool();
        if (!p) return;
        
        console.log('[DB] Checking MySQL Schema...');

        await p.query(`
            CREATE TABLE IF NOT EXISTS brands (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                industry VARCHAR(255),
                contact_person VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(255),
                status VARCHAR(100) DEFAULT 'Pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await p.query(`
            CREATE TABLE IF NOT EXISTS partners (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                company VARCHAR(255),
                city VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(255),
                address TEXT,
                status VARCHAR(100) DEFAULT 'Pending',
                revenue_share_percentage INT DEFAULT 50,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Safe migration: add address column if missing
        try { await p.query("ALTER TABLE partners ADD COLUMN address TEXT"); } catch(e) {}

        await p.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(255) DEFAULT 'Admin',
                brand_id INT,
                partner_id INT,
                force_password_reset BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
                FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
            )
        `);
        
        try {
            await p.query("ALTER TABLE users ADD COLUMN email VARCHAR(255) UNIQUE AFTER username");
        } catch(e) {}

        try {
            await p.query("ALTER TABLE users ADD COLUMN force_password_reset BOOLEAN DEFAULT FALSE");
        } catch(e) {}

        const [users] = await p.query("SELECT COUNT(*) as c FROM users");
        if (users[0].c === 0) {
            // Need to use Better Auth compatible hashing
            const { hashPassword } = await import('@better-auth/utils/password');
            const hash = await hashPassword('admin123');
            const [userResult] = await p.query(
                "INSERT INTO users (username, email, password_hash, role) VALUES ('admin', 'admin@signtral.com', ?, 'SuperAdmin')", 
                [hash]
            );
            
            // Better Auth requires an entry in the 'account' table for credential login
            if (userResult.insertId) {
                await p.query(
                    "INSERT INTO account (id, userId, providerId, accountId, password) VALUES (?, ?, 'credential', ?, ?)",
                    [Math.random().toString(36).substring(2), userResult.insertId, 'admin@signtral.com', hash]
                );
            }
            console.log('[DB] Created default user: admin / admin123 (and Better Auth account)');
        }

        await p.query(`
            CREATE TABLE IF NOT EXISTS invoices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                invoice_number VARCHAR(255) NOT NULL UNIQUE,
                brand_id INT,
                amount DECIMAL(10,2) NOT NULL,
                status VARCHAR(100) DEFAULT 'Pending',
                due_date DATE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
            )
        `);

        await p.query(`
            CREATE TABLE IF NOT EXISTS screen_partners (
                displayId INT PRIMARY KEY,
                partner_id INT,
                FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
            )
        `);

        await p.query(`
            CREATE TABLE IF NOT EXISTS slots (
                id INT AUTO_INCREMENT PRIMARY KEY,
                displayId INT NOT NULL,
                slot_number INT NOT NULL,
                brand_id INT,
                status VARCHAR(100) DEFAULT 'Available',
                playlist_id INT,
                xibo_widget_id INT,
                mediaId INT,
                duration INT DEFAULT 13,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE(displayId, slot_number),
                FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
            )
        `);

        // Migration for existing slots table
        try { await p.query("ALTER TABLE slots ADD COLUMN playlist_id INT"); } catch(e) {}
        try { await p.query("ALTER TABLE slots ADD COLUMN xibo_widget_id INT"); } catch(e) {}
        try { await p.query("ALTER TABLE slots ADD COLUMN mediaId INT"); } catch(e) {}
        try { await p.query("ALTER TABLE slots ADD COLUMN duration INT DEFAULT 13"); } catch(e) {}

        await p.query(`
            CREATE TABLE IF NOT EXISTS media_brands (
                mediaId INT PRIMARY KEY,
                brand_id INT,
                status VARCHAR(100) DEFAULT 'Approved',
                FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
            )
        `);

        // Migration for existing media_brands table
        try { await p.query("ALTER TABLE media_brands ADD COLUMN status VARCHAR(100) DEFAULT 'Approved'"); } catch(e) {}

        await p.query(`
            CREATE TABLE IF NOT EXISTS screens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                city VARCHAR(255),
                address TEXT,
                latitude DOUBLE,
                longitude DOUBLE,
                timezone VARCHAR(255) DEFAULT 'Asia/Kolkata',
                partner_id INT,
                xibo_display_id INT,
                xibo_display_group_id INT,
                status VARCHAR(100) DEFAULT 'Pending',
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
            )
        `);
 
        await p.query(`
            CREATE TABLE IF NOT EXISTS daily_media_stats (
                mediaId INT NOT NULL,
                displayId INT NOT NULL,
                date DATE NOT NULL,
                count INT DEFAULT 0,
                PRIMARY KEY (mediaId, displayId, date)
            )
        `);

        console.log('[DB] Connected to MySQL database successfully.');

    } catch (err) {
        console.error('[DB] Initialize Error:', err.message);
    }
}

// Automatically init the schema on load
const dbReady = initSchema();

/**
 * SQLite Translation layer for MySQL code compatibility.
 */
const transformSql = (sql) => {
    // MySQL uses REPLACE INTO instead of INSERT OR REPLACE INTO
    let result = sql.replace(/INSERT OR REPLACE INTO/gi, 'REPLACE INTO');
    result = result.replace(/INSERT OR IGNORE INTO/gi, 'INSERT IGNORE INTO');
    return result;
};

const dbRun = async (sql, params = []) => {
    const p = await getPool();
    if (!p) throw new Error('Database not connected');
    const [result] = await p.query(transformSql(sql), params);
    return { id: result.insertId, changes: result.affectedRows };
};

const dbAll = async (sql, params = []) => {
    const p = await getPool();
    if (!p) throw new Error('Database not connected');
    const [rows] = await p.query(transformSql(sql), params);
    return rows;
};

const dbGet = async (sql, params = []) => {
    const p = await getPool();
    if (!p) throw new Error('Database not connected');
    const [rows] = await p.query(transformSql(sql), params);
    return rows.length > 0 ? rows[0] : undefined;
};

module.exports = {
    db: {
        getPool // exported in case of direct access needs
    },
    dbReady,
    dbRun,
    dbAll,
    dbGet
};
