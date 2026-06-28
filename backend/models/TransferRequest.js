const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TransferRequest = sequelize.define('TransferRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  from_account_id: { type: DataTypes.UUID, allowNull: false },
  to_account_number: { type: DataTypes.STRING(20), allowNull: false },
  to_account_name: { type: DataTypes.STRING(200) },
  to_bank_name: { type: DataTypes.STRING(200) },
  to_ifsc: { type: DataTypes.STRING(20) },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  transfer_mode: { type: DataTypes.ENUM('NEFT', 'RTGS', 'IMPS', 'INTERNAL'), allowNull: false },
  description: { type: DataTypes.STRING(500) },
  status: { type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'cancelled'), defaultValue: 'pending' },
  scheduled_at: { type: DataTypes.DATE },
  processed_at: { type: DataTypes.DATE },
  reference_number: { type: DataTypes.STRING(30), unique: true },
  otp_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  pin_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  failure_reason: { type: DataTypes.STRING(500) },
}, { tableName: 'transfer_requests' });

module.exports = TransferRequest;
