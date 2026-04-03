-- ============================================================
-- CMS Full Schema Migration
-- Run: mysql -u $DB_USER -p$DB_PASSWORD $DB_NAME < migrations/001_init.sql
-- ============================================================

-- Brands
CREATE TABLE IF NOT EXISTS brands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(255),
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(255),
  status ENUM('Pending','Active','Disabled') DEFAULT 'Pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Partners
CREATE TABLE IF NOT EXISTS partners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  city VARCHAR(100),
  contact VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(255),
  address TEXT,
  registration_status ENUM('Pending','Active','Suspended') DEFAULT 'Pending',
  revenue_share_percentage INT DEFAULT 50,
  bank_details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('SuperAdmin','Admin','Brand','Partner') DEFAULT 'Brand',
  brand_id INT,
  partner_id INT,
  force_password_reset BOOLEAN DEFAULT FALSE,
  status ENUM('Active','Disabled') DEFAULT 'Active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
);

-- Screens
CREATE TABLE IF NOT EXISTS screens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(255),
  address TEXT,
  latitude DOUBLE,
  longitude DOUBLE,
  timezone VARCHAR(255) DEFAULT 'Asia/Kolkata',
  partner_id INT,
  xibo_display_id INT,
  xibo_display_group_id INT,
  orientation ENUM('Landscape','Portrait') DEFAULT 'Landscape',
  resolution ENUM('HD','4K') DEFAULT 'HD',
  device_id VARCHAR(100),
  status ENUM('Online','Offline','Unknown','Pending') DEFAULT 'Pending',
  last_sync DATETIME,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
);

-- Slots (20-slot ad management per screen)
CREATE TABLE IF NOT EXISTS slots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  displayId INT NOT NULL,
  slot_number INT NOT NULL,
  brand_id INT,
  status VARCHAR(100) DEFAULT 'Available',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(displayId, slot_number),
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

-- Screen <-> Partner mapping
CREATE TABLE IF NOT EXISTS screen_partners (
  displayId INT PRIMARY KEY,
  partner_id INT,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
);

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  campaign_name VARCHAR(255) NOT NULL,
  brand_id INT,
  screen_id VARCHAR(50),
  slot_number INT,
  start_date DATE,
  end_date DATE,
  creative_id INT,
  status ENUM('Active','Paused','Stopped','Ended') DEFAULT 'Active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_name VARCHAR(100) UNIQUE NOT NULL,
  permissions JSON
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(255) NOT NULL UNIQUE,
  brand_id INT,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('Pending','Paid','Overdue') DEFAULT 'Pending',
  due_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

-- Partner payouts
CREATE TABLE IF NOT EXISTS partner_payouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  partner_id INT,
  month VARCHAR(20),
  amount DECIMAL(10,2),
  status ENUM('Pending','Paid') DEFAULT 'Pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

-- Media <-> Brand mapping (for Proof of Play attribution)
CREATE TABLE IF NOT EXISTS media_brands (
  mediaId INT PRIMARY KEY,
  brand_id INT,
  FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

-- ============================================================
-- Seed: Default SuperAdmin user (password: admin123)
-- bcrypt hash pre-generated for 'admin123' with cost factor 10
-- ============================================================
INSERT IGNORE INTO users (username, password_hash, role)
VALUES ('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'SuperAdmin');
