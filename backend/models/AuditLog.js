const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID },
  admin_id: { type: DataTypes.UUID },
  action: { type: DataTypes.STRING(200), allowNull: false },
  entity_type: { type: DataTypes.STRING(100) },
  entity_id: { type: DataTypes.STRING(100) },
  old_values: { type: DataTypes.JSON },
  new_values: { type: DataTypes.JSON },
  ip_address: { type: DataTypes.STRING(50) },
  user_agent: { type: DataTypes.TEXT },
  status: { type: DataTypes.ENUM('success', 'failure', 'warning'), defaultValue: 'success' },
  description: { type: DataTypes.TEXT },
}, { tableName: 'audit_logs' });

module.exports = AuditLog;
