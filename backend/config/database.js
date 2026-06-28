const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    // ── Connection pool ─────────────────────────────────────────────────────
    // IMPORTANT (Hostinger + PM2 cluster mode): the TOTAL number of MySQL
    // connections this app opens is `PM2 worker count × pool.max`. On shared
    // MySQL plans the server's max_connections is low (often ~25–75), so a high
    // per-worker pool combined with many cluster workers exhausts it and MySQL
    // starts returning "Too many connections" — surfacing as intermittent 500s
    // on writes like POST /account/open.
    //
    // Keep pool.max conservative and configurable. With the default of 5 and a
    // bounded PM2 instance count, total connections stay well within limits.
    // `acquire` is raised to 60s so a momentarily-busy/slow DB queues the
    // request instead of throwing a connection-acquire timeout.
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 5,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 0,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 60000,
      idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
    },
  }
);

module.exports = sequelize;