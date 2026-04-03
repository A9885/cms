'use strict';

const mysql = require('mysql2/promise');

/**
 * MySQL connection pool.
 * Import this anywhere you need a raw pool connection:
 *   const pool = require('./src/db');
 *   const [rows] = await pool.query('SELECT ...', [params]);
 */
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'cms_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
