module.exports = {
  apps: [{
    name: 'signtral-cms',
    script: 'server.js',
    instances: 'max',       // Utilize all CPU cores
    exec_mode: 'cluster',    // Run in cluster mode for scalability
    autorestart: true,
    watch: false,            // Don't watch files in production
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Log configuration
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true
  }]
};
