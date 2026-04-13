-- ============================================================
-- Signtral / Xibo CMS — Full MySQL Schema
-- Generated: 2026-04-14
-- Run this on a fresh MySQL database to reproduce all tables.
-- Usage: mysql -u root -p xibo_crm < migrations/mysql_schema.sql
-- ============================================================

-- Brands
CREATE TABLE IF NOT EXISTS brands (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    name             VARCHAR(255) NOT NULL,
    industry         VARCHAR(255),
    contact_person   VARCHAR(255),
    email            VARCHAR(255),
    phone            VARCHAR(255),
    status           VARCHAR(100) DEFAULT 'Pending',
    created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- Partners
CREATE TABLE IF NOT EXISTS partners (
    id                        INT AUTO_INCREMENT PRIMARY KEY,
    name                      VARCHAR(255) NOT NULL,
    company                   VARCHAR(255),
    city                      VARCHAR(255),
    email                     VARCHAR(255),
    phone                     VARCHAR(255),
    address                   TEXT,
    status                    VARCHAR(100) DEFAULT 'Pending',
    revenue_share_percentage  INT          DEFAULT 50,
    xibo_provision_status     VARCHAR(50)  DEFAULT 'not_started',
    xibo_folder_id            INT,
    xibo_display_group_id     INT,
    created_at                DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- Users  (Better Auth compatible: has email, username, role, brand_id, partner_id)
CREATE TABLE IF NOT EXISTS users (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    username             VARCHAR(255) UNIQUE NOT NULL,
    email                VARCHAR(255) UNIQUE,
    password_hash        VARCHAR(255) NOT NULL,
    role                 VARCHAR(255) DEFAULT 'Admin',
    brand_id             INT,
    partner_id           INT,
    force_password_reset BOOLEAN      DEFAULT FALSE,
    created_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id)   REFERENCES brands(id)   ON DELETE SET NULL,
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(255)    NOT NULL UNIQUE,
    brand_id       INT,
    amount         DECIMAL(10,2)   NOT NULL,
    status         VARCHAR(100)    DEFAULT 'Pending',
    due_date       DATE,
    created_at     DATETIME        DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

-- Screen ↔ Partner mapping (legacy; screens table is preferred)
CREATE TABLE IF NOT EXISTS screen_partners (
    displayId  INT PRIMARY KEY,
    partner_id INT,
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
);

-- Slots (20-slot advertising system per display)
CREATE TABLE IF NOT EXISTS slots (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    displayId       INT          NOT NULL,
    slot_number     INT          NOT NULL,
    brand_id        INT,
    status          VARCHAR(100) DEFAULT 'Available',
    playlist_id     INT,
    xibo_widget_id  INT,
    mediaId         INT,
    duration        INT          DEFAULT 13,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_display_slot (displayId, slot_number),
    FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

-- Media → Brand association (for Proof of Play)
CREATE TABLE IF NOT EXISTS media_brands (
    mediaId   INT PRIMARY KEY,
    brand_id  INT,
    status    VARCHAR(100) DEFAULT 'Approved',
    FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL
);

-- Screens (registered physical displays)
CREATE TABLE IF NOT EXISTS screens (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    name                  VARCHAR(255) NOT NULL,
    city                  VARCHAR(255),
    address               TEXT,
    latitude              DOUBLE,
    longitude             DOUBLE,
    timezone              VARCHAR(255) DEFAULT 'Asia/Kolkata',
    partner_id            INT,
    xibo_display_id       INT,
    xibo_display_group_id INT,
    status                VARCHAR(100) DEFAULT 'Pending',
    notes                 TEXT,
    created_at            DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
);

-- Daily Media Stats (local high-performance aggregation)
CREATE TABLE IF NOT EXISTS daily_media_stats (
    mediaId   INT  NOT NULL,
    displayId INT  NOT NULL,
    date      DATE NOT NULL,
    count     INT  DEFAULT 0,
    PRIMARY KEY (mediaId, displayId, date)
);

-- Partner Xibo Credentials (multi-tenant SaaS)
CREATE TABLE IF NOT EXISTS partner_xibo_credentials (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    partner_id        INT         NOT NULL UNIQUE,
    xibo_base_url     VARCHAR(512) NOT NULL,
    client_id         VARCHAR(255) NOT NULL,
    client_secret     VARCHAR(255) NOT NULL,
    access_token      TEXT,
    token_expires_at  DATETIME,
    provision_status  ENUM('pending','provisioning','active','error') DEFAULT 'pending',
    provision_error   TEXT,
    provision_log     JSON,
    created_at        DATETIME    DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

-- Partner Xibo Resources (provisioned resource IDs per partner)
CREATE TABLE IF NOT EXISTS partner_xibo_resources (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    partner_id          INT         NOT NULL,
    resource_type       ENUM('folder','display_group','layout','playlist','campaign','schedule') NOT NULL,
    xibo_resource_id    INT         NOT NULL,
    xibo_resource_name  VARCHAR(512),
    meta                JSON,
    created_at          DATETIME    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_partner_resource (partner_id, resource_type),
    FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

-- Activity Logs (audit trail)
CREATE TABLE IF NOT EXISTS activity_logs (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT          DEFAULT NULL,
    action      VARCHAR(50)  NOT NULL,
    module      VARCHAR(50)  NOT NULL,
    description TEXT         NOT NULL,
    ip_address  VARCHAR(100) DEFAULT NULL,
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_module     (module),
    INDEX idx_action     (action),
    INDEX idx_user_id    (user_id),
    INDEX idx_created_at (created_at)
);
