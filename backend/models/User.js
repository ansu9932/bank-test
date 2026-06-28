const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  customer_id: { type: DataTypes.STRING(20), unique: true, allowNull: false },
  first_name: { type: DataTypes.STRING(100), allowNull: false },
  last_name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(200), unique: true, allowNull: false },
  phone: { type: DataTypes.STRING(20), unique: true, allowNull: false },
  date_of_birth: { type: DataTypes.DATEONLY, allowNull: false },
  gender: { type: DataTypes.ENUM('male', 'female', 'other'), allowNull: false },
  father_name: { type: DataTypes.STRING(200) },
  mother_name: { type: DataTypes.STRING(200) },
  marital_status: { type: DataTypes.ENUM('single', 'married', 'divorced', 'widowed') },
  nationality: { type: DataTypes.STRING(100), defaultValue: 'Indian' },
  occupation: { type: DataTypes.STRING(200) },
  annual_income: { type: DataTypes.DECIMAL(15, 2) },
  address_line1: { type: DataTypes.STRING(300), allowNull: false },
  address_line2: { type: DataTypes.STRING(300) },
  city: { type: DataTypes.STRING(100), allowNull: false },
  state: { type: DataTypes.STRING(100), allowNull: false },
  pincode: { type: DataTypes.STRING(10), allowNull: false },
  country: { type: DataTypes.STRING(100), defaultValue: 'India' },
  aadhaar_number: { type: DataTypes.STRING(12) },
  pan_number: { type: DataTypes.STRING(10) },
  passport_number: { type: DataTypes.STRING(20) },
  // Country-specific national ID numbers (Nepal / Bhutan / Bangladesh).
  citizenship_number: { type: DataTypes.STRING(30) },
  cid_number: { type: DataTypes.STRING(20) },
  national_id_number: { type: DataTypes.STRING(20) },
  tin_number: { type: DataTypes.STRING(20) },
  username: { type: DataTypes.STRING(100), unique: true },
  password_hash: { type: DataTypes.STRING(255) },
  security_pin: { type: DataTypes.STRING(255) },
  account_type: { type: DataTypes.ENUM('savings', 'current'), allowNull: false },
  kyc_status: { type: DataTypes.ENUM('pending', 'under_review', 'video_kyc_pending', 'approved', 'rejected'), defaultValue: 'pending' },
  account_status: { type: DataTypes.ENUM('pending', 'active', 'frozen', 'closed'), defaultValue: 'pending' },
  email_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  two_factor_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  profile_picture: { type: DataTypes.STRING(500) },
  last_login: { type: DataTypes.DATE },
  login_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  locked_until: { type: DataTypes.DATE },
  preferred_language: { type: DataTypes.STRING(10), defaultValue: 'en' },
  dark_mode: { type: DataTypes.BOOLEAN, defaultValue: true },
  account_nickname: { type: DataTypes.STRING(100) },
  ip_address: { type: DataTypes.STRING(50) },
  device_fingerprint: { type: DataTypes.TEXT },
  video_kyc_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
  setup_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
  referral_code: { type: DataTypes.STRING(20) },
}, {
  tableName: 'users',
  // NOTE: No explicit `indexes` array.
  // customer_id, email, phone and username already create unique indexes via
  // their field-level `unique: true`. Re-declaring email/customer_id/phone here
  // (plus a non-essential kyc_status filter index) produced duplicate indexes
  // that, combined with sync({ alter: true }) on every boot, overflowed MySQL's
  // 64-index-per-table limit.
});

module.exports = User;
