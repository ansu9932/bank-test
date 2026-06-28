const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const KYCDocument = sequelize.define('KYCDocument', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  document_type: {
    type: DataTypes.ENUM(
      // India
      'aadhaar', 'pan',
      // Nepal / Bhutan / Bangladesh national IDs
      'citizenship_certificate', 'cid', 'national_id', 'tin',
      // Common
      'passport', 'selfie', 'signature', 'address_proof', 'video_kyc'
    ),
    allowNull: false,
  },
  file_path: { type: DataTypes.STRING(500), allowNull: false },
  file_name: { type: DataTypes.STRING(300) },
  file_size: { type: DataTypes.INTEGER },
  mime_type: { type: DataTypes.STRING(100) },
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' },
  rejection_reason: { type: DataTypes.STRING(500) },
  reviewed_by: { type: DataTypes.UUID },
  reviewed_at: { type: DataTypes.DATE },
  is_encrypted: { type: DataTypes.BOOLEAN, defaultValue: false },
}, { tableName: 'kyc_documents' });

module.exports = KYCDocument;
