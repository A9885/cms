#!/bin/bash

# Signtral CMS VPS Setup Script
# Run this on your VPS to prepare the environment

echo "🚀 Starting Signtral CMS Setup..."

# 1. Update system and install Node.js (if not present)
if ! command -v node &> /dev/null; then
    echo "📦 Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# 2. Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    sudo npm install -g pm2
fi

# 3. Create logs directory
mkdir -p logs
echo "📁 Logs directory created."

# 4. Install dependencies
echo "📦 Installing project dependencies..."
npm install --production

# 5. Run database migrations
echo "🗄️ Running database setup..."
npm run db:migrate -- --fresh

# 6. Start the server with PM2
echo "🚀 Launching server with PM2..."
pm2 start ecosystem.config.js --env production

# 7. Setup PM2 to start on boot
echo "⚙️ Setting up PM2 boot script..."
pm2 save
pm2 startup

echo "✅ Setup complete! Use 'pm2 logs' to see the server output."
echo "🔗 Your server should now be running on port 3000."
