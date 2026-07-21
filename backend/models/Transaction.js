const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  account_id: { type: DataTypes.UUID, allowNull: false },
  reference_number: { type: DataTypes.STRING(30), unique: true, allowNull: false },
  transaction_type: { type: DataTypes.ENUM('credit', 'debit'), allowNull: false },
  transfer_mode: { type: DataTypes.ENUM('NEFT', 'RTGS', 'IMPS', 'INTERNAL', 'SALARY', 'INTEREST', 'CHARGE', 'REVERSAL', 'SYSTEM', 'SWIFT'), defaultValue: 'INTERNAL' },
  amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  balance_before: { type: DataTypes.DECIMAL(15, 2) },
  balance_after: { type: DataTypes.DECIMAL(15, 2) },
  description: { type: DataTypes.STRING(500) },
  narration: { type: DataTypes.STRING(500) },
  status: { type: DataTypes.ENUM('pending', 'processing', 'success', 'failed', 'reversed'), defaultValue: 'pending' },
  to_account_number: { type: DataTypes.STRING(20) },
  to_account_name: { type: DataTypes.STRING(200) },
  to_bank_name: { type: DataTypes.STRING(200) },
  to_ifsc: { type: DataTypes.STRING(20) },
  from_account_number: { type: DataTypes.STRING(20) },
  from_account_name: { type: DataTypes.STRING(200) },
  category: { type: DataTypes.STRING(100) },
  // JSON tags. IMPORTANT: on MariaDB (common on shared hosts) a "JSON" column
  // is really LONGTEXT, so the mysql dialect can hand the value back as a raw
  // string instead of a parsed object. Readers like the SWIFT self-approval
  // lookup do `txn.tags.approvalTokenHash`, which silently fails on a string
  // — so this getter always normalizes to an object (parsing up to twice to
  // also cover double-encoded legacy rows).
  tags: {
    type: DataTypes.JSON,
    get() {
      let raw = this.getDataValue('tags');
      let attempts = 0;
      while (typeof raw === 'string' && attempts < 2) {
        try { raw = JSON.parse(raw); } catch { return null; }
        attempts += 1;
      }
      return typeof raw === 'object' ? raw : null;
    },
  },
  ip_address: { type: DataTypes.STRING(50) },
  device_info: { type: DataTypes.STRING(200) },
  // Client-supplied idempotency key: a repeated transfer request with the same
  // key returns the ORIGINAL result instead of double-spending. Uniqueness is
  // enforced in application code (no DB index — 64-index overflow guard).
  idempotency_key: { type: DataTypes.STRING(100) },
  failure_reason: { type: DataTypes.STRING(500) },
  processed_at: { type: DataTypes.DATE },
  reversal_reason: { type: DataTypes.STRING(500) },
  is_flagged: { type: DataTypes.BOOLEAN, defaultValue: false },
  flag_reason: { type: DataTypes.STRING(500) },
  receipt_path: { type: DataTypes.STRING(500) },
  scheduled_at: { type: DataTypes.DATE },
  is_scheduled: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
  tableName: 'transactions',
  // reference_number already has a unique index via field-level `unique: true`.
  // The previous explicit indexes duplicated reference_number and added
  // non-mandatory filter indexes (account_id / status / created_at) which were
  // re-created on every alter sync and contributed to the 64-index overflow.
});

module.exports = Transaction;
