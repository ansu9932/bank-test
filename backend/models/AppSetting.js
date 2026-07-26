const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · APP SETTINGS (KEY-VALUE)
   Small admin-managed key/value store for runtime configuration that must be
   switchable from the admin panel WITHOUT a redeploy (e.g. which SMS provider
   is active: 'twilio' or 'brevo').

   Plain sequelize.sync() auto-creates this table on next boot (missing tables
   are always created; existing tables are never altered).
   ────────────────────────────────────────────────────────────────────────── */
const AppSetting = sequelize.define('AppSetting', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  // Unique setting key, e.g. 'sms_provider'.
  key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  // The stored value (kept as string; parse as needed by the consumer).
  value: { type: DataTypes.STRING(500), allowNull: false },
  // Admin who last changed this setting (for traceability).
  updated_by: { type: DataTypes.UUID },
}, {
  tableName: 'app_settings',
});

module.exports = AppSetting;
