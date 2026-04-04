-- ============================================================
-- Migration 002: Subscriptions + Slot Enhancements
-- Run: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/002_subscriptions.sql
-- ============================================================

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL,
  plan_name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  screens_included INT NOT NULL DEFAULT 1,
  slots_included INT NOT NULL DEFAULT 1,
  cities TEXT,
  payment_status ENUM('Pending','Paid','Overdue') DEFAULT 'Pending',
  status ENUM('Draft','Awaiting Payment','Active','Paused','Expired','Cancelled') DEFAULT 'Draft',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
);

-- Enhance slots table with date range + subscription linkage
-- (Using conditional adds via stored procedure trick for compatibility)
SET @dbname = DATABASE();

-- Add subscription_id if not exists
SET @stmt = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'slots' AND COLUMN_NAME = 'subscription_id') = 0,
  'ALTER TABLE slots ADD COLUMN subscription_id INT',
  'SELECT "subscription_id already exists"'
);
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Add start_date if not exists  
SET @stmt2 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'slots' AND COLUMN_NAME = 'start_date') = 0,
  'ALTER TABLE slots ADD COLUMN start_date DATE',
  'SELECT "start_date already exists"'
);
PREPARE s2 FROM @stmt2; EXECUTE s2; DEALLOCATE PREPARE s2;

-- Add end_date if not exists
SET @stmt3 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'slots' AND COLUMN_NAME = 'end_date') = 0,
  'ALTER TABLE slots ADD COLUMN end_date DATE',
  'SELECT "end_date already exists"'
);
PREPARE s3 FROM @stmt3; EXECUTE s3; DEALLOCATE PREPARE s3;

-- Add creative_name if not exists
SET @stmt4 = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'slots' AND COLUMN_NAME = 'creative_name') = 0,
  'ALTER TABLE slots ADD COLUMN creative_name VARCHAR(255)',
  'SELECT "creative_name already exists"'
);
PREPARE s4 FROM @stmt4; EXECUTE s4; DEALLOCATE PREPARE s4;
