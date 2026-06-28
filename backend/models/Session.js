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
}, { tableName: 'sessions' });

module.exports = Session;
