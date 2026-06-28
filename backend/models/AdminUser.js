const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AdminUser = sequelize.define('AdminUser', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  username: { type: DataTypes.STRING(100), unique: true, allowNull: false },
  email: { type: DataTypes.STRING(200), unique: true, allowNull: false },
  password_hash: { type: DataTypes.STRING(255), allowNull: false },
  full_name: { type: DataTypes.STRING(200), allowNull: false },
  role: { type: DataTypes.ENUM('super_admin', 'admin', 'kyc_officer', 'support', 'viewer'), defaultValue: 'admin' },
  permissions: { type: DataTypes.JSON },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  last_login: { type: DataTypes.DATE },
  two_factor_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  ip_whitelist: { type: DataTypes.JSON },
}, { tableName: 'admin_users' });

module.exports = AdminUser;
