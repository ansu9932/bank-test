const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * QR-code login sessions ("scan to login" on the NetBanking website).
 *
 * Lifecycle: pending → scanned → approved | rejected | expired
 *
 * Security properties:
 *  - qr_id is a 48-hex-char cryptographically random identifier; the QR code
 *    on the desktop encodes `ALISTERBANK:QRLOGIN:v1:<qr_id>` and nothing else.
 *  - Sessions live ~60 seconds and are single-use: the browser can consume
 *    the login token exactly once, after which the row is dead forever.
 *  - The one-time login token is stored ONLY as a SHA-256 hash. The raw
 *    token exists in the DB for delivery (login_token once) and is nulled
 *    the moment the polling browser picks it up.
 *  - user_id is set at scan time (from the app's verified device token) and
 *    approval is only accepted from that same user + device.
 */
const QrLoginSession = sequelize.define('QrLoginSession', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  qr_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'pending', // pending | scanned | approved | rejected | expired | consumed
  },
  // Browser context captured at creation — shown on the phone before approval
  // so the customer can reject login attempts they don't recognize.
  browser_ip: { type: DataTypes.STRING(50) },
  browser_agent: { type: DataTypes.TEXT },
  // Who scanned it (set at scan time from the app's verified device token).
  user_id: { type: DataTypes.UUID },
  device_id: { type: DataTypes.STRING(100) },
  scanned_at: { type: DataTypes.DATE },
  approved_at: { type: DataTypes.DATE },
  // One-time login token: hash for verification + raw for one delivery.
  login_token_hash: { type: DataTypes.STRING(255) },
  login_token: { type: DataTypes.STRING(255) },
  token_delivered_at: { type: DataTypes.DATE },
  consumed_at: { type: DataTypes.DATE },
  expires_at: { type: DataTypes.DATE, allowNull: false },
}, { tableName: 'qr_login_sessions' });

module.exports = QrLoginSession;
