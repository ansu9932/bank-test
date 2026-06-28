module.exports = {
  apps: [
    {
      name: 'alister-bank-api',
      script: './backend/server.js',
      // ── Cluster size ──────────────────────────────────────────────────────
      // Bounded (NOT 'max'). Total MySQL connections = instances × DB_POOL_MAX,
      // so an unbounded 'max' (one worker per CPU core) can exhaust the shared
      // MySQL connection limit and cause intermittent 500s on writes. Override
      // per-host with the PM2_INSTANCES env var if more workers are needed.
      instances: process.env.PM2_INSTANCES || 2,
      exec_mode: 'cluster',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './backend/logs/pm2-error.log',
      out_file: './backend/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '500M',
    },
  ],
};
