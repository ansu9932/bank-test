const sequelize = require('../config/database');
const User = require('./User');
const Account = require('./Account');
const Transaction = require('./Transaction');
const Beneficiary = require('./Beneficiary');
const OTP = require('./OTP');
const KYCDocument = require('./KYCDocument');
const Session = require('./Session');
const Notification = require('./Notification');
const AuditLog = require('./AuditLog');
const AdminUser = require('./AdminUser');
const TransferRequest = require('./TransferRequest');
const SupportTicket = require('./SupportTicket');
const SecureLink = require('./SecureLink');
const CardRequest = require('./CardRequest');
const ApprovedCard = require('./ApprovedCard');
const AdminDevice = require('./AdminDevice');
const EmailCampaign = require('./EmailCampaign');
const ChatOTP = require('./ChatOTP');

// Associations
User.hasOne(Account, { foreignKey: 'user_id', as: 'account' });
Account.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(KYCDocument, { foreignKey: 'user_id', as: 'documents' });
KYCDocument.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Account.hasMany(Transaction, { foreignKey: 'account_id', as: 'transactions' });
Transaction.belongsTo(Account, { foreignKey: 'account_id', as: 'account' });

User.hasMany(Beneficiary, { foreignKey: 'user_id', as: 'beneficiaries' });
Beneficiary.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Notification, { foreignKey: 'user_id', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Session, { foreignKey: 'user_id', as: 'sessions' });
Session.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(SupportTicket, { foreignKey: 'user_id', as: 'tickets' });
SupportTicket.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(CardRequest, { foreignKey: 'user_id', as: 'cardRequests' });
CardRequest.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  sequelize,
  User,
  Account,
  Transaction,
  Beneficiary,
  OTP,
  KYCDocument,
  Session,
  Notification,
  AuditLog,
  AdminUser,
  TransferRequest,
  SupportTicket,
  SecureLink,
  CardRequest,
  ApprovedCard,
  AdminDevice,
  EmailCampaign,
  ChatOTP,
};
