const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * ChatOTP — OTPs issued exclusively for the AVA chatbot in-chat verification
 * flow. Kept in its OWN table (separate from the auth `otps` table) so:
 *   1. The existing otps.purpose ENUM never needs an ENUM migration
 *      (schema sync is locked to alter:false on production).
 *   2. Chat OTP lockout/attempt semantics can't interfere with login/2FA OTPs.
 *
 * Plain sequelize.sync() auto-creates this table on next boot (missing tables
 * are always created; existing tables are never altered).
 *
 * Security properties:
 *   - otp_hash: SHA-256 of the 6-digit code — plaintext is NEVER stored.
 *   - attempts + locked: permanently locks an OTP after 5 wrong guesses.
 *   - used: set on success AND on invalidation (a new send voids old codes).
 */
const ChatOTP = sequelize.define('ChatOTP', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING(200), allowNull: false },
  otp_hash: { type: DataTypes.STRING(255), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  used: { type: DataTypes.BOOLEAN, defaultValue: false },
  attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  locked: { type: DataTypes.BOOLEAN, defaultValue: false },
  ip_address: { type: DataTypes.STRING(50) },
}, {
  tableName: 'chat_otps',
});

module.exports = ChatOTP;
