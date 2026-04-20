#!/bin/bash

# Signtral Database Backup Script
# Stores gzipped SQL dumps in /var/www/signtral_back/backups/

# 1. Load environment variables
ENV_FILE="/var/www/signtral_back/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: .env file not found at $ENV_FILE"
    exit 1
fi

# Source the .env file while handling carriage returns
export $(grep -v '^#' "$ENV_FILE" | xargs -0) 2>/dev/null || export $(grep -v '^#' "$ENV_FILE" | sed 's/\r$//')

# 2. Setup Variables
BACKUP_DIR="/var/www/signtral_back/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="signtral_db_$TIMESTAMP.sql"
DEST="$BACKUP_DIR/$FILENAME"

# 3. Perform Backup
echo "Starting backup: $FILENAME"
mysqldump -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$DEST"

if [ $? -eq 0 ]; then
    # 4. Success! Now Gzip to save space
    gzip "$DEST"
    echo "Backup complete: ${FILENAME}.gz"
    
    # 5. Cleanup: Keep only last 7 days of backups
    find "$BACKUP_DIR" -name "signtral_db_*.sql.gz" -mtime +7 -delete
    echo "Old backups cleaned up."
else
    echo "Error: Backup failed."
    rm -f "$DEST"
    exit 1
fi
