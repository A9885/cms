-- ============================================================
-- Supplemental Migration: Fix Better Auth Schema
-- Run: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/003_fix_auth_schema.sql
-- ============================================================

-- 1. Modify 'users' table columns
-- Note: Changing 'id' from INT to VARCHAR(255) is complex if foreign keys exist.
-- If you have foreign keys, you might need to drop them first.
-- However, for a fresh server setup, this is simpler.

-- Try to convert ID to VARCHAR (this might fail if there are FK constraints, 
-- but Better Auth REQUIRES VARCHAR for its built-in logic in many cases).
ALTER TABLE users MODIFY id VARCHAR(255);

-- Add missing columns with camelCase for Better Auth compatibility
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255) AFTER id;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE AFTER username;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emailVerified BOOLEAN DEFAULT FALSE AFTER email;
ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT AFTER emailVerified;

-- Rename created_at to createdAt if it exists as created_at
-- (Using a check to avoid errors if already renamed)
SET @exist = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='users' AND COLUMN_NAME='created_at' AND TABLE_SCHEMA=DATABASE());
SET @s = IF(@exist > 0, 'ALTER TABLE users CHANGE created_at createdAt DATETIME DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add updatedAt
ALTER TABLE users ADD COLUMN IF NOT EXISTS updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 2. Ensure Better Auth core tables exist
CREATE TABLE IF NOT EXISTS account (
    id TEXT NOT NULL,
    userId TEXT NOT NULL,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    password TEXT,
    accessToken TEXT,
    refreshToken TEXT,
    idToken TEXT,
    expiresAt DATETIME,
    passwordExpiresAt DATETIME,
    scope TEXT,
    createdAt DATETIME NOT NULL,
    updatedAt DATETIME NOT NULL,
    PRIMARY KEY (id(255))
);

CREATE TABLE IF NOT EXISTS session (
    id TEXT NOT NULL,
    userId TEXT NOT NULL,
    token TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    createdAt DATETIME NOT NULL,
    updatedAt DATETIME NOT NULL,
    PRIMARY KEY (id(255))
);

CREATE TABLE IF NOT EXISTS verification (
    id TEXT NOT NULL,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME,
    updatedAt DATETIME,
    PRIMARY KEY (id(255))
);

-- 3. Ensure a default admin exists with the new ID format
INSERT IGNORE INTO users (id, username, email, password_hash, role)
VALUES ('admin_001', 'admin', 'admin@signtral.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'SuperAdmin');
