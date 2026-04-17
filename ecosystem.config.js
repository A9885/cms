module.exports = {
  apps: [{
    name: 'signtral-cms',
    script: 'server.js',
    instances: 'max',       // Utilize all CPU cores
    exec_mode: 'cluster',    // Run in cluster mode for scalability
    autorestart: true,
    watch: false,            // Don't watch files in production
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      ALLOWED_ORIGINS: '*' // Change this to your production domain in .env
    },
    // Log configuration
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    time: true // Add timestamp to logs
  }]
};
