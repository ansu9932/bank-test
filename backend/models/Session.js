const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Session = sequelize.define('Session', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  token_hash: { type: DataTypes.STRING(500), allowNull: false },
  ip_address: { type: DataTypes.STRING(50) },
  user_agent: { type: DataTypes.TEXT },
  device_type: { type: DataTypes.STRING(50) },
  location: { type: DataTypes.STRING(200) },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  last_activity: { type: DataTypes.DATE },
  expires_at: { type: DataTypes.DATE },
  logout_at: { type: DataTypes.DATE },
  // ── Refresh-token rotation ─────────────────────────────────────────────────
  // SHA-256 hash of the CURRENT refresh token. Single-use: rotated on every
  // /auth/refresh call. A presented token that doesn't match the stored hash
  // on an active session indicates replay/theft → the session is revoked.
  refresh_token_hash: { type: DataTypes.STRING(255) },
  refresh_expires_at: { type: DataTypes.DATE },
  // Opaque device identifier sent by the native Android app (device binding).
  device_id: { type: DataTypes.STRING(100) },
  // Where this session was created: 'web' (browser NetBanking) or 'app'
  // (native mobile app). Powers mutual exclusion — a user signed in on one
  // channel must log out before signing in on the other.
  channel: { type: DataTypes.STRING(10), defaultValue: 'web' },
}, { tableName: 'sessions' });

module.exports = Session;
