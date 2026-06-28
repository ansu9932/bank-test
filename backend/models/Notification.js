const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING(200), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  type: { type: DataTypes.ENUM('transaction', 'security', 'kyc', 'system', 'offer', 'alert'), defaultValue: 'system' },
  is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
  action_url: { type: DataTypes.STRING(500) },
  icon: { type: DataTypes.STRING(100) },
  priority: { type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'), defaultValue: 'medium' },
}, { tableName: 'notifications' });

module.exports = Notification;
