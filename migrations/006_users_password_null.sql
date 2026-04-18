-- ============================================================
-- Supplemental Migration: Fix users table password default
-- Run: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/006_users_password_null.sql
-- ============================================================

-- Ensure the password field allows NULL since password_hash is used to store passwords
ALTER TABLE users MODIFY COLUMN password VARCHAR(255) NULL;
