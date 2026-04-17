-- ============================================================
-- Supplemental Migration: Fix Better Auth Schema (Rev 2)
-- Run: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/003_fix_auth_schema.sql
-- ============================================================

-- Disable FK checks to allow changing column types across tables
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Modify 'users' table columns
-- Changing 'id' type (this will work now that FK checks are disabled)
ALTER TABLE users MODIFY id VARCHAR(255) NOT NULL;

-- Add missing columns with camelCase for Better Auth compatibility
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255) AFTER id;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE AFTER username;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emailVerified BOOLEAN DEFAULT FALSE AFTER email;
ALTER TABLE users ADD COLUMN IF NOT EXISTS image TEXT AFTER emailVerified;

-- Rename created_at to createdAt if it exists
SET @exist_ca = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='users' AND COLUMN_NAME='created_at' AND TABLE_SCHEMA=DATABASE());
SET @s_ca = IF(@exist_ca > 0, 'ALTER TABLE users CHANGE created_at createdAt DATETIME DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE stmt_ca FROM @s_ca; EXECUTE stmt_ca; DEALLOCATE PREPARE stmt_ca;

-- Add updatedAt
ALTER TABLE users ADD COLUMN IF NOT EXISTS updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- 2. Ensure Better Auth core tables exist with VARCHAR(255) for IDs
-- (Required for MySQL indexing and primary key compatibility)

CREATE TABLE IF NOT EXISTS account (
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
    updatedAt DATETIME NOT NULL
);

-- If account table already exists, ensure its userId is VARCHAR(255)
ALTER TABLE account MODIFY userId VARCHAR(255);

CREATE TABLE IF NOT EXISTS session (
    id VARCHAR(255) PRIMARY KEY,
    userId VARCHAR(255) NOT NULL,
    token TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    ipAddress VARCHAR(255),
    userAgent TEXT,
    createdAt DATETIME NOT NULL,
    updatedAt DATETIME NOT NULL
);

-- If session table already exists, ensure its userId is VARCHAR(255)
ALTER TABLE session MODIFY userId VARCHAR(255);

CREATE TABLE IF NOT EXISTS verification (
    id VARCHAR(255) PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt DATETIME NOT NULL,
    createdAt DATETIME,
    updatedAt DATETIME
);

-- Re-enable FK checks
SET FOREIGN_KEY_CHECKS = 1;

-- 3. Ensure a default admin exists with the new ID format
INSERT IGNORE INTO users (id, username, email, password_hash, role)
VALUES ('admin_001', 'admin', 'admin@signtral.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'SuperAdmin');
