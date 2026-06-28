const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SupportTicket = sequelize.define('SupportTicket', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  ticket_number: { type: DataTypes.STRING(20), unique: true, allowNull: false },
  subject: { type: DataTypes.STRING(300), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  category: { type: DataTypes.ENUM('transaction', 'kyc', 'account', 'card', 'technical', 'other') },
  priority: { type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'), defaultValue: 'medium' },
  status: { type: DataTypes.ENUM('open', 'in_progress', 'resolved', 'closed'), defaultValue: 'open' },
  assigned_to: { type: DataTypes.UUID },
  resolution: { type: DataTypes.TEXT },
  resolved_at: { type: DataTypes.DATE },
  attachments: { type: DataTypes.JSON },
}, { tableName: 'support_tickets' });

module.exports = SupportTicket;
