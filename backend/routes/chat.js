const express = require('express');
const rateLimit = require('express-rate-limit');
const { tooManyRequests } = require('../utils/apiResponse');
const chatController = require('../controllers/chatController');

const router = express.Router();

// ─── Per-IP rate limiters (AVA chatbot) ───────────────────────────────────────

// Chat messages: max 20/minute — blocks scripted abuse while staying invisible
// to a human typing normally.
const chatMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => tooManyRequests(res, "You're sending messages too quickly. Please wait a minute and try again."),
});

// OTP sending: max 5 per 10 minutes — blocks email bombing.
const chatOtpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => tooManyRequests(res, 'Too many verification codes requested. Please wait 10 minutes and try again.'),
});

// OTP verification: max 10 tries per 10 minutes — blocks brute-force guessing.
const chatOtpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => tooManyRequests(res, 'Too many verification attempts. Please wait 10 minutes and try again.'),
});

// ─── Routes ───────────────────────────────────────────────────────────────────
// All endpoints are public; personal data additionally requires the short-lived
// X-Chat-Token issued by /otp/verify (enforced inside the controller).
router.post('/message', chatMessageLimiter, chatController.handleMessage);
router.post('/otp/send', chatOtpSendLimiter, chatController.sendChatOtp);
router.post('/otp/verify', chatOtpVerifyLimiter, chatController.verifyChatOtp);
// DOB confirmation (second factor after OTP) — shares the strict verify limiter.
router.post('/dob/verify', chatOtpVerifyLimiter, chatController.verifyChatDob);

module.exports = router;
