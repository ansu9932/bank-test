/**
 * QR-code login routes.
 *
 * Browser (public, heavily rate-limited):
 *   POST /api/qr-login/create           → new QR session (qrId + server-rendered QR image)
 *   GET  /api/qr-login/status/:qrId     → pending|scanned|approved|rejected|expired (+ one-time token, once)
 *   POST /api/qr-login/exchange         → one-time token → full web session
 *
 * Mobile app (device-token authenticated inside the controller):
 *   POST /api/qr-login/scan             → validate payload, bind user+device, return context
 *   POST /api/qr-login/approve          → swipe + MPIN → mint one-time login token
 *   POST /api/qr-login/reject           → kill the request
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const qr = require('../controllers/qrLoginController');
const { loginLimiter, otpLimiter, authLimiter } = require('../middleware/security');
const { badRequest } = require('../utils/apiResponse');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors.array()[0].msg);
  return next();
};

// Browser side
router.post('/create', otpLimiter, qr.create);
router.get('/status/:qrId', authLimiter, qr.status);
router.post('/exchange', loginLimiter, [
  body('qrId').notEmpty().withMessage('Session is required'),
  body('loginToken').notEmpty().withMessage('Token is required'),
], validate, qr.exchange);

// App side
router.post('/scan', loginLimiter, [
  body('qrPayload').notEmpty().withMessage('QR payload is required'),
  body('deviceToken').notEmpty().withMessage('Device token is required'),
  body('deviceId').notEmpty().withMessage('Device ID is required'),
], validate, qr.scan);
router.post('/approve', loginLimiter, [
  body('qrId').notEmpty().withMessage('Session is required'),
  body('deviceToken').notEmpty().withMessage('Device token is required'),
  body('deviceId').notEmpty().withMessage('Device ID is required'),
  body('mpin').notEmpty().withMessage('MPIN is required'),
], validate, qr.approve);
router.post('/reject', authLimiter, [
  body('qrId').notEmpty().withMessage('Session is required'),
  body('deviceToken').notEmpty().withMessage('Device token is required'),
], validate, qr.reject);

module.exports = router;
