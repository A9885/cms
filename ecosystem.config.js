module.exports = {
  apps: [{
    name: 'signtral-cms',
    script: 'server.js',
    cwd: '/var/www/cms', // Set correct working directory for VPS
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    // Production log configuration
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/cms/error.log',
    out_file: '/var/log/cms/out.log',
    log_file: '/var/log/cms/combined.log',
    merge_logs: true
  }]
};
