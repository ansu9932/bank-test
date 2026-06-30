const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * AdminDevice — allowlist of browsers/devices permitted to access the admin panel.
 *
 * Each admin browser generates a persistent `device_id` (stored in its
 * localStorage) and sends it at login. A device must be `approved` by a
 * super-admin before the admin panel will issue a session for it. New devices
 * are recorded as `pending` and blocked until approved (or `revoked` to cut
 * off access). The very first device used by a super-admin is auto-approved
 * (trust-on-first-use) to avoid a lockout on initial setup.
 */
const AdminDevice = sequelize.define('AdminDevice', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  // Opaque client-generated identifier (UUID) stored in the browser.
  device_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  // Friendly label derived from the user-agent (e.g. "Chrome on macOS").
  label: { type: DataTypes.STRING(200) },
  user_agent: { type: DataTypes.STRING(500) },
  ip_address: { type: DataTypes.STRING(50) },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'revoked'),
    defaultValue: 'pending',
  },
  // The admin who first logged in from this device.
  first_admin_id: { type: DataTypes.UUID },
  // The super-admin who approved it, and when.
  approved_by: { type: DataTypes.UUID },
  approved_at: { type: DataTypes.DATE },
  last_seen_at: { type: DataTypes.DATE },
}, {
  tableName: 'admin_devices',
});

module.exports = AdminDevice;
