const { DataTypes } = require('sequelize');
const crypto = require('crypto');
const sequelize = require('../config/database');

const CardRequest = sequelize.define('CardRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  request_type: { type: DataTypes.ENUM('debit_card', 'cheque_book'), allowNull: false },
  // 'active' added so an approved/issued debit card is a first-class state
  // distinct from the physical-delivery states reused by cheque books.
  status: {
    type: DataTypes.ENUM('pending', 'processing', 'active', 'dispatched', 'delivered', 'cancelled'),
    defaultValue: 'pending',
  },
  delivery_address: { type: DataTypes.TEXT },
  tracking_number: { type: DataTypes.STRING(100) },
  expected_delivery: { type: DataTypes.DATEONLY },
  notes: { type: DataTypes.TEXT },

  // ── Premium debit-card fields ───────────────────────────────────────────────
  // 'Visa' | 'Mastercard'
  card_network: { type: DataTypes.STRING(20) },
  // 'Gold' | 'Platinum' | 'Business'
  card_tier: { type: DataTypes.STRING(20) },
  // Card number is stored as SHA-256 hash only (PCI-DSS compliant).
  // Never store or log the plaintext card number.
  card_number_hash: { type: DataTypes.STRING(64), unique: true },
  // Last 4 digits for UI display only (no sensitive data)
  card_last4: { type: DataTypes.STRING(4) },
  // CVV is NEVER stored. Return 403 if client attempts to write it.
  // 'MM/YY'
  expiry_date: { type: DataTypes.STRING(5) },

  // Real-world card controls. Defaults: usable, ATM + domestic on, intl off.
  controls: {
    type: DataTypes.JSON,
    defaultValue: {
      frozen: false,
      atm_enabled: true,
      domestic_enabled: true,
      international_enabled: false,
      domestic_limit: 100000,
      international_limit: 0,
    },
  },

  // ── Issuance fee accounting ─────────────────────────────────────────────────
  issuance_fee: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0.00 },
  // 'charged' once debited at submission, 'refunded' if the request is rejected.
  fee_status: { type: DataTypes.ENUM('none', 'charged', 'refunded'), defaultValue: 'none' },
  // Reference number of the fee debit transaction (for traceable refunds).
  fee_reference: { type: DataTypes.STRING(30) },
}, { tableName: 'card_requests' });

module.exports = CardRequest;
