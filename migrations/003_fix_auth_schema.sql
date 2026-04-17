-- ============================================================
-- Supplemental Migration: Fix Better Auth Schema (Rev 3 - Aggressive)
-- Run: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/003_fix_auth_schema.sql
-- ============================================================

-- Disable FK checks to allow destructive changes
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Drop existing Better Auth tables to clear all blocking FKs
-- Since this is a new hosting, dropping these is the safest way to fix schema mismatches.
-- The 'users' table is NOT dropped to preserve your admin account.
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS oauth; 

-- 2. Modify 'users' table columns
-- Now that all referencing tables are gone, this WILL succeed.
ALTER TABLE users MODIFY id VARCHAR(255) NOT NULL;

-- Add missing columns with camelCase for Better Auth compatibility
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255) AFTER id;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE AFTER username;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emailVerified BOOLEAN DEFAULT FALSE AFTER email;
ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT AFTER emailVerified;

-- Standardize created/updated fields
SET @exist_ca = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='users' AND COLUMN_NAME='created_at' AND TABLE_SCHEMA=DATABASE());
SET @s_ca = IF(@exist_ca > 0, 'ALTER TABLE users CHANGE created_at createdAt DATETIME DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE stmt_ca FROM @s_ca; EXECUTE stmt_ca; DEALLOCATE PREPARE stmt_ca;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 3. Recreate Better Auth tables with standardized VARCHAR(255) types
-- This ensures they match the users.id type perfectly.
CREATE TABLE account (
    id VARCHAR(255) PRIMARY KEY,
    userId VARCHAR(255) NOT NULL,
    accountId VARCHAR(255) NOT NULL,
    providerId VARCHAR(255) NOT NULL,
    password TEXT,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    expiresAt DATETIME,
    passwordExpiresAt DATETIME,
    scope TEXT,
    createdAt DATETIME NOT NULL,
    updatedAt DATETIME NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE session (
    id VARCHAR(255) PRIMARY KEY,
    userId VARCHAR(255) NOT NULL,
    token TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    ipAddress VARCHAR(255),
    userAgent TEXT,
    createdAt DATETIME NOT NULL,
    updatedAt DATETIME NOT NULL,
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE verification (
    id VARCHAR(255) PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME,
    updatedAt DATETIME
);

-- Re-enable FK checks
SET FOREIGN_KEY_CHECKS = 1;

-- 4. Ensure a default admin exists with the new ID format
INSERT IGNORE INTO users (id, username, email, password_hash, role)
VALUES ('admin_001', 'admin', 'admin@signtral.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'SuperAdmin');
