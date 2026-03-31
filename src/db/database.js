const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'admin_portal.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('[DB] Could not connect to database:', err.message);
    } else {
        db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'Admin',
            brand_id INTEGER,
            partner_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (brand_id) REFERENCES brands(id),
            FOREIGN KEY (partner_id) REFERENCES partners(id)
        )
    `, (err) => {
        // Migration: Add brand_id to existing users table if missing
        db.run("ALTER TABLE users ADD COLUMN brand_id INTEGER", (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('[DB] Migration Error (users.brand_id):', err.message);
            }
        });
        
        // Migration: Add partner_id to existing users table if missing
        db.run("ALTER TABLE users ADD COLUMN partner_id INTEGER", (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('[DB] Migration Error (users.partner_id):', err.message);
            }
        });
        
        if (err) console.error('[DB] Users Table Error:', err.message);
        else {
            // Insert default super admin if none exists
            db.get('SELECT COUNT(*) as c FROM users', (e, row) => {
                if (!e && row.c === 0) {
                    const bcrypt = require('bcryptjs');
                    const hash = bcrypt.hashSync('admin123', 10);
                    db.run("INSERT INTO users (username, password_hash, role) VALUES ('admin', ?, 'SuperAdmin')", [hash]);
                    console.log('[DB] Created default user: admin / admin123');
                }
            });
        }
    });

    console.log('[DB] Connected to SQLite database at', dbPath);
    }
});

// Initialize Schema
db.serialize(() => {
    // BRANDS TABLE
    db.run(`CREATE TABLE IF NOT EXISTS brands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        industry TEXT,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // PARTNERS TABLE
    db.run(`CREATE TABLE IF NOT EXISTS partners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company TEXT,
        city TEXT,
        email TEXT,
        phone TEXT,
        status TEXT DEFAULT 'Pending',
        revenue_share_percentage INTEGER DEFAULT 50,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // INVOICES TABLE
    db.run(`CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL UNIQUE,
        brand_id INTEGER,
        amount DECIMAL(10,2) NOT NULL,
        status TEXT DEFAULT 'Pending',
        due_date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (brand_id) REFERENCES brands(id)
    )`);

    // SCREEN ASSIGNMENTS (Linking Screens to Partners)
    // displayId matches Xibo displayId
    db.run(`CREATE TABLE IF NOT EXISTS screen_partners (
        displayId INTEGER PRIMARY KEY,
        partner_id INTEGER,
        FOREIGN KEY (partner_id) REFERENCES partners(id)
    )`);

    // SLOTS TABLE (Phase 4: Dedicated Screen Slots)
    db.run(`CREATE TABLE IF NOT EXISTS slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        displayId INTEGER NOT NULL,
        slot_number INTEGER NOT NULL,
        brand_id INTEGER,
        status TEXT DEFAULT 'Available',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(displayId, slot_number),
        FOREIGN KEY (brand_id) REFERENCES brands(id)
    )`);

    // MEDIA TO BRAND MAPPING (Phase 4.1: Slot-level PoP Tracking)
    db.run(`CREATE TABLE IF NOT EXISTS media_brands (
        mediaId INTEGER PRIMARY KEY,
        brand_id INTEGER,
        FOREIGN KEY (brand_id) REFERENCES brands(id)
    )`);

    // LOCAL SCREENS TABLE
    // Allows admins to create/manage screen records independently of Xibo.
    // xibo_display_id can be set later once the player connects and registers.
    db.run(`CREATE TABLE IF NOT EXISTS screens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        city TEXT,
        address TEXT,
        latitude REAL,
        longitude REAL,
        timezone TEXT DEFAULT 'Asia/Kolkata',
        partner_id INTEGER,
        xibo_display_id INTEGER,
        xibo_display_group_id INTEGER,
        status TEXT DEFAULT 'Pending',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (partner_id) REFERENCES partners(id)
    )`);
});

// Wrapper to use Promises with sqlite3
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
    });
});

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
    });
});

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

module.exports = {
    db,
    dbRun,
    dbAll,
    dbGet
};
