const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter, loginLimiter, otpLimiter } = require('../middleware/security');
const { badRequest } = require('../utils/apiResponse');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array());
  next();
};

router.post('/login', loginLimiter, [
  body('username').notEmpty().withMessage('Username/email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], validate, authController.login);

// Ephemeral handshake nonce for the secure login gateway (HDFC-style).
// Client fetches this first, appends it to the URL, and echoes it on submit.
router.get('/login-handshake', authController.loginHandshake);

router.post('/logout', protect, authController.logout);
router.get('/me', protect, authController.getMe);

// Lightweight concurrent-login heartbeat for the customer dashboard.
// Returns 200 { active, reason } (never a hard 401 for a superseded token).
router.get('/session-status', authController.sessionStatus);

router.post('/send-otp', otpLimiter, [
  body('email').isEmail().withMessage('Valid email is required'),
  body('purpose').notEmpty().withMessage('Purpose is required'),
], validate, authController.sendOTP);

router.post('/verify-otp', [
  body('email').isEmail(),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric(),
  body('purpose').notEmpty(),
], validate, authController.verifyOTP);

// Read-only password re-check (native app: pre-biometric-enable confirmation).
// Rate-limited with authLimiter so it can't be used as a password oracle.
router.post('/verify-password', protect, authLimiter, [
  body('password').notEmpty().withMessage('Password is required'),
], validate, authController.verifyPassword);

router.post('/change-password', protect, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], validate, authController.changePassword);

router.post('/forgot-password', authLimiter, [
  body('email').isEmail(),
], validate, authController.forgotPassword);

// ─── Identity-verification password reset (3-step wizard) ────────────────────
// Public, pre-login. All three steps are rate-limited with authLimiter to
// throttle brute-forcing of account number / DOB combinations.
// Self-hosted CAPTCHA challenge for the reset-password step (no external service).
router.get('/captcha', authController.getCaptcha);
router.post('/verify-userid', authLimiter, [
  body('userId').notEmpty().withMessage('User ID is required'),
], validate, authController.verifyUserId);

router.post('/verify-account-details', authLimiter, [
  body('userId').notEmpty(),
  body('accountNumber').notEmpty().withMessage('Account number is required'),
  body('dateOfBirth').isISO8601().withMessage('A valid date of birth is required'),
], validate, authController.verifyAccountDetails);

router.post('/send-reset-link', authLimiter, [
  body('userId').notEmpty(),
  body('accountNumber').notEmpty(),
  body('dateOfBirth').isISO8601(),
], validate, authController.sendResetLink);

// Final reset step — public + unauthenticated, so it's rate-limited with
// authLimiter (throttles token-guessing from a single IP) and enforces a
// stronger server-side password policy than the frontend's 8-char minimum.
router.post('/reset-password', authLimiter, [
  body('token').notEmpty(),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain an uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain a lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain a number'),
], validate, authController.resetPassword);

router.post('/setup-account', [
  body('token').notEmpty(),
  body('username').isLength({ min: 5 }),
  body('password').isLength({ min: 8 }),
  body('securityPin').isLength({ min: 4, max: 4 }).isNumeric(),
], validate, authController.setupAccount);

router.get('/verify-setup/:token', authController.verifySetup);

// Self-service onboarding link regeneration (expired Video KYC / Account Setup).
router.post('/regenerate-link', authLimiter, [
  body('email').isEmail().withMessage('A valid email is required'),
  body('customerId').notEmpty().withMessage('Customer ID is required'),
  body('type').isIn(['account-setup', 'video-kyc']).withMessage('A valid link type is required'),
], validate, authController.regenerateOnboardingLink);

module.exports = router;
