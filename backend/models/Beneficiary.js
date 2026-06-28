const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Beneficiary = sequelize.define('Beneficiary', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  nickname: { type: DataTypes.STRING(100), allowNull: false },
  account_number: { type: DataTypes.STRING(20), allowNull: false },
  account_name: { type: DataTypes.STRING(200), allowNull: false },
  bank_name: { type: DataTypes.STRING(200) },
  ifsc_code: { type: DataTypes.STRING(20) },
  account_type: { type: DataTypes.ENUM('savings', 'current') },
  is_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  daily_limit: { type: DataTypes.DECIMAL(15, 2), defaultValue: 100000.00 },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  last_transfer: { type: DataTypes.DATE },
}, { tableName: 'beneficiaries' });

module.exports = Beneficiary;
