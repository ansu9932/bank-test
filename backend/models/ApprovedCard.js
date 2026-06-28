const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · APPROVED CARD (SANDBOX / SIMULATION ONLY)
   Admin-managed allow-list of cards that the activation-deposit SIMULATOR will
   accept. This is NOT a real payment system — no card is charged and no money
   moves through a processor. It exists purely to demo/simulate the onboarding
   "activation deposit" step in a sandbox environment.

   Only the SHA-256 hash of the digits is stored for matching, plus the last 4
   and the holder name for display in the (clearly-labelled simulated) receipt.
   ────────────────────────────────────────────────────────────────────────── */
const ApprovedCard = sequelize.define('ApprovedCard', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  // Friendly label so the admin can recognise the entry in the list.
  label: { type: DataTypes.STRING(120) },
  // SHA-256 of the digit-only card number. Used to match an entered card.
  card_number_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  last4: { type: DataTypes.STRING(4), allowNull: false },
  card_holder_name: { type: DataTypes.STRING(120), allowNull: false },
  // 'Visa' | 'Mastercard' | 'Unknown' (auto-detected from the number).
  network: { type: DataTypes.STRING(20), defaultValue: 'Unknown' },
  // Optional MM/YY expiry, purely cosmetic for the simulated receipt.
  expiry: { type: DataTypes.STRING(5) },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  created_by: { type: DataTypes.UUID },
}, {
  tableName: 'approved_cards',
});

module.exports = ApprovedCard;
