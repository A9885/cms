-- ============================================================
-- Fix DateTime Defaults for account and session tables
-- Run: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/004_fix_datetime_defaults.sql
-- ============================================================

-- Fix createdAt and updatedAt columns in account table
ALTER TABLE account MODIFY createdAt DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE account MODIFY updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL;

-- Fix createdAt and updatedAt columns in session table
ALTER TABLE session MODIFY createdAt DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL;
ALTER TABLE session MODIFY updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL;

-- Fix createdAt and updatedAt columns in verification table (if it exists)
ALTER TABLE verification MODIFY createdAt DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL;
