const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SecureLink = sequelize.define('SecureLink', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  token: { type: DataTypes.STRING(255), unique: true, allowNull: false },
  purpose: { type: DataTypes.ENUM('video_kyc', 'account_setup', 'password_reset', 'email_verify'), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  used: { type: DataTypes.BOOLEAN, defaultValue: false },
  used_at: { type: DataTypes.DATE },
  ip_address: { type: DataTypes.STRING(50) },
}, { tableName: 'secure_links' });

module.exports = SecureLink;
