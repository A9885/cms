-- ============================================================
-- Ensure account table allows NULL for optional fields
-- Run: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/005_account_null_defaults.sql
-- ============================================================

-- Make sure password field allows NULL with explicit default
ALTER TABLE account MODIFY password TEXT NULL DEFAULT NULL;

-- Ensure all token fields allow NULL
ALTER TABLE account MODIFY accessToken TEXT NULL DEFAULT NULL;
ALTER TABLE account MODIFY refreshToken TEXT NULL DEFAULT NULL;
ALTER TABLE account MODIFY idToken TEXT NULL DEFAULT NULL;

-- Ensure datetime fields allow NULL
ALTER TABLE account MODIFY expiresAt DATETIME NULL DEFAULT NULL;
ALTER TABLE account MODIFY passwordExpiresAt DATETIME NULL DEFAULT NULL;

-- Ensure scope allows NULL
ALTER TABLE account MODIFY scope TEXT NULL DEFAULT NULL;
