/**
 * Mobile app onboarding + MPIN login routes (mounted at /api/app).
 * All steps are rate-limited: the identity steps ride the strict login
 * limiter, OTP steps ride the OTP limiter.
 */
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const appAuth = require('../controllers/appAuthController');
const { protect } = require('../middleware/auth');
const { loginLimiter, otpLimiter, authLimiter } = require('../middleware/security');
const { badRequest } = require('../utils/apiResponse');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, 'Validation failed', errors.array());
  next();
};

// Step 1 — Customer ID + DOB (strict limiter: identity probing surface).
router.post('/verify-customer', loginLimiter, [
  body('customerId').notEmpty().withMessage('Customer ID is required'),
  body('dob').notEmpty().withMessage('Date of birth is required'),
], validate, appAuth.verifyCustomer);

// Step 1b — confirm identity + accept terms → OTP is sent.
router.post('/confirm-identity', otpLimiter, [
  body('onboardingToken').notEmpty().withMessage('Token is required'),
  body('acceptTerms').isBoolean().withMessage('Terms acceptance is required'),
], validate, appAuth.confirmIdentity);

// Step 2 — email OTP.
router.post('/verify-otp', otpLimiter, [
  body('otp').notEmpty().withMessage('Code is required'),
  body('onboardingToken').notEmpty().withMessage('Token is required'),
], validate, appAuth.verifyOtp);

router.post('/resend-otp', otpLimiter, [
  body('onboardingToken').notEmpty().withMessage('Token is required'),
], validate, appAuth.resendOtp);

// Step 3 — one-time NetBanking password confirm.
router.post('/verify-password', loginLimiter, [
  body('password').notEmpty().withMessage('Password is required'),
  body('onboardingToken').notEmpty().withMessage('Token is required'),
], validate, appAuth.verifyPassword);

// Step 4 — MPIN setup + device registration.
router.post('/setup-mpin', authLimiter, [
  body('mpin').notEmpty().withMessage('MPIN is required'),
  body('deviceId').notEmpty().withMessage('Device ID is required'),
  body('onboardingToken').notEmpty().withMessage('Token is required'),
], validate, appAuth.setupMpin);

// Returning-user quick login.
router.post('/mpin-login', loginLimiter, [
  body('mpin').notEmpty().withMessage('MPIN is required'),
  body('deviceId').notEmpty().withMessage('Device ID is required'),
  body('deviceToken').notEmpty().withMessage('Device token is required'),
], validate, appAuth.mpinLogin);

// Normal logout — ends the session but keeps the device registered (MPIN
// login still works). Unblocks website sign-in immediately.
router.post('/logout-session', protect, appAuth.logoutSession);

// Forget this device (requires an active session).
router.post('/logout-device', protect, appAuth.logoutDevice);

module.exports = router;
