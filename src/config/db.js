'use strict';

require('dotenv').config();
const mysql = require('mysql2/promise');

// ─── Startup ENV Validation ───────────────────────────────────────────────────
// Throw a hard error at boot time if any required DB variable is missing.
// This prevents silent "undefined" connections that fail at query time.
const REQUIRED_DB_VARS = ['DB_HOST', 'DB_USER', 'DB_NAME'];
for (const key of REQUIRED_DB_VARS) {
    if (!process.env[key]) {
        throw new Error(
            `[DB] ❌ Missing required environment variable: ${key}\n` +
            `     → Check your .env file. Required: ${REQUIRED_DB_VARS.join(', ')}`
        );
    }
}

/**
 * MySQL connection pool.
 *
 * Import anywhere you need a DB connection:
 *   const pool = require('./src/config/db');
 *   const [rows] = await pool.query('SELECT ...', [params]);
 *
 * Uses a pool (not single connection) for concurrency safety.
 */
const pool = mysql.createPool({
    host:              process.env.DB_HOST,
    port:              parseInt(process.env.DB_PORT, 10) || 3306,
    user:              process.env.DB_USER,
    password:          process.env.DB_PASSWORD,
    database:          process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit:   10,
    queueLimit:        0,
    // Ensure dates are returned as JS Date objects
    dateStrings:       false
});

module.exports = pool;
