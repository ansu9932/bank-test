const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Account = sequelize.define('Account', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  account_number: { type: DataTypes.STRING(20), unique: true, allowNull: false },
  ifsc_code: { type: DataTypes.STRING(20), allowNull: false },
  swift_code: { type: DataTypes.STRING(20) },
  account_type: { type: DataTypes.ENUM('savings', 'current', 'business_elite'), allowNull: false },
  balance: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0.00 },
  available_balance: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0.00 },
  hold_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0.00 },
  currency: { type: DataTypes.STRING(5), defaultValue: 'USD' },
  status: { type: DataTypes.ENUM('active', 'frozen', 'dormant', 'closed'), defaultValue: 'active' },
  // Active daily transaction limit. New accounts start RESTRICTED at 100 (the
  // product-mandated default; intended as 100 USD — note the app currently
  // renders amounts with the $ symbol). An admin can raise it up to the
  // $500,000 max ceiling via modifyUserCeiling.
  daily_transfer_limit: { type: DataTypes.DECIMAL(15, 2), defaultValue: 100.00 },
  // ── Per-user transfer-method locks ──────────────────────────────────────────
  // Which outgoing rails this customer may use. By policy the external rails
  // (IMPS / NEFT / UPI) are LOCKED by default and only an admin can activate
  // them per user; the on-us "Alister Internal" transfer stays enabled. See
  // utils/transferMethods.js (normalizeTransferMethods treats NULL as this
  // secure default so the lock holds even before the column backfill runs).
  transfer_methods: {
    type: DataTypes.JSON,
    defaultValue: { imps: false, neft: false, upi: false, internal: true, add_money: false, swift: false },
  },
  daily_transferred: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0.00 },
  last_limit_reset: { type: DataTypes.DATE },
  interest_rate: { type: DataTypes.DECIMAL(5, 2), defaultValue: 4.00 },
  minimum_balance: { type: DataTypes.DECIMAL(10, 2), defaultValue: 5298.00 },
  nomination_name: { type: DataTypes.STRING(200) },
  nomination_relation: { type: DataTypes.STRING(100) },
  branch_name: { type: DataTypes.STRING(200), defaultValue: 'Alister Bank Main Branch' },
  branch_code: { type: DataTypes.STRING(20) },
  card_issued: { type: DataTypes.BOOLEAN, defaultValue: false },
  card_number_masked: { type: DataTypes.STRING(20) },
  cheque_book_issued: { type: DataTypes.BOOLEAN, defaultValue: false },
  // ── Activation deposit onboarding ────────────────────────────────────────
  // Set true once the user completes the minimum-balance activation
  // deposit; activation_deposit_at gates the ~2-minute-later account-setup email.
  activation_deposit_done: { type: DataTypes.BOOLEAN, defaultValue: false },
  activation_deposit_at: { type: DataTypes.DATE },
}, {
  tableName: 'accounts',
  // account_number already has a unique index via field-level `unique: true`.
  // The previous explicit indexes duplicated it (account_number) and added a
  // non-mandatory user_id filter index — both removed to stay under the 64 cap.
});

module.exports = Account;
