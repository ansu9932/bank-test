const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * EmailCampaign — the "mail history" record for admin-composed manual emails.
 *
 * One row is created per send (via POST /api/admin/email-campaigns). As the
 * frontend dispatches the recipients in batches, each batch updates
 * sent_count / failed_count here, so the row doubles as the source of truth for
 * both the live progress bar and the history page. status transitions:
 *   sending → completed (all delivered) | partial (some failed) | failed (none delivered)
 */
const EmailCampaign = sequelize.define('EmailCampaign', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  admin_id: { type: DataTypes.UUID, allowNull: true },
  admin_name: { type: DataTypes.STRING(200), allowNull: true },
  subject: { type: DataTypes.STRING(255), allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  greet: { type: DataTypes.BOOLEAN, defaultValue: true },
  send_to_all: { type: DataTypes.BOOLEAN, defaultValue: false },
  only_active: { type: DataTypes.BOOLEAN, defaultValue: false },
  // Array of attached file display names (no default — avoids MySQL JSON
  // default-value constraints on older versions; app code treats NULL as []).
  attachment_names: { type: DataTypes.JSON, allowNull: true },
  total_recipients: { type: DataTypes.INTEGER, defaultValue: 0 },
  sent_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  failed_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  status: { type: DataTypes.STRING(20), defaultValue: 'sending' },
}, { tableName: 'email_campaigns' });

module.exports = EmailCampaign;
