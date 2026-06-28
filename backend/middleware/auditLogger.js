const { AuditLog } = require('../models');
const logger = require('../utils/logger');

/**
 * Create an audit log entry
 */
const createAuditLog = async ({
  userId = null,
  adminId = null,
  action,
  entityType = null,
  entityId = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
  userAgent = null,
  status = 'success',
  description = null,
}) => {
  try {
    await AuditLog.create({
      user_id: userId,
      admin_id: adminId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: ipAddress,
      user_agent: userAgent,
      status,
      description,
    });
  } catch (err) {
    logger.error(`Audit log creation failed: ${err.message}`);
  }
};

/**
 * Express middleware — auto-log all requests
 */
const auditMiddleware = (action, entityType) => async (req, res, next) => {
  res.on('finish', () => {
    const status = res.statusCode < 400 ? 'success' : 'failure';
    createAuditLog({
      userId: req.user?.id,
      adminId: req.admin?.id,
      action,
      entityType,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      status,
      description: `${req.method} ${req.originalUrl}`,
    }).catch(() => {});
  });
  next();
};

module.exports = { createAuditLog, auditMiddleware };
