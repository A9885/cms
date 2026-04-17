-- ============================================================
-- Supplemental Migration: Fix Better Auth Schema (Rev 4 - Max Compatibility)
-- Run: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/003_fix_auth_schema.sql
-- ============================================================

-- Disable FK checks to allow destructive changes
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Drop existing Better Auth tables to clear all blocking FKs
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS oauth; 

-- 2. Modify 'users' table columns
-- Standardize ID type
ALTER TABLE users MODIFY id VARCHAR(255) NOT NULL;

-- Safe Column Addition Procedure
-- (This ensures compatibility with both MySQL 5.7 and MySQL 8.0)
DROP PROCEDURE IF EXISTS AddColumnSafely;
DELIMITER //
CREATE PROCEDURE AddColumnSafely(
    IN tableName VARCHAR(255),
    IN columnName VARCHAR(255),
    IN columnType VARCHAR(255),
    IN afterColumn VARCHAR(255)
)
BEGIN
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_NAME = tableName AND COLUMN_NAME = columnName AND TABLE_SCHEMA = DATABASE()
    ) THEN
        SET @sql = CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN ', columnName, ' ', columnType, ' AFTER ', afterColumn);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

-- Add missing columns safely
CALL AddColumnSafely('users', 'name', 'VARCHAR(255)', 'id');
CALL AddColumnSafely('users', 'email', 'VARCHAR(255)', 'username');
CALL AddColumnSafely('users', 'emailVerified', 'BOOLEAN DEFAULT FALSE', 'email');
CALL AddColumnSafely('users', 'image', 'TEXT', 'emailVerified');

-- Unique index for email (Safe Addition)
SET @exist_email_idx = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_NAME='users' AND INDEX_NAME='email' AND TABLE_SCHEMA=DATABASE());
SET @s_email_idx = IF(@exist_email_idx = 0, 'ALTER TABLE users ADD UNIQUE (email)', 'SELECT 1');
PREPARE stmt_e FROM @s_email_idx; EXECUTE stmt_e; DEALLOCATE PREPARE stmt_e;

-- Standardize created/updated fields
SET @exist_ca = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='users' AND COLUMN_NAME='created_at' AND TABLE_SCHEMA=DATABASE());
SET @s_ca = IF(@exist_ca > 0, 'ALTER TABLE users CHANGE created_at createdAt DATETIME DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE stmt_ca FROM @s_ca; EXECUTE stmt_ca; DEALLOCATE PREPARE stmt_ca;

SET @exist_ua = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='users' AND COLUMN_NAME='updatedAt' AND TABLE_SCHEMA=DATABASE());
SET @s_ua = IF(@exist_ua = 0, 'ALTER TABLE users ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE stmt_ua FROM @s_ua; EXECUTE stmt_ua; DEALLOCATE PREPARE stmt_ua;

-- Cleanup procedure
DROP PROCEDURE IF EXISTS AddColumnSafely;

-- 3. Recreate Better Auth tables with standardized VARCHAR(255) types
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
