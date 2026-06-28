const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const hpp = require('hpp');
const { tooManyRequests } = require('../utils/apiResponse');

/**
 * Rate limiter — general API
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => tooManyRequests(res, 'Too many requests. Please try again after 15 minutes.'),
});

/**
 * Rate limiter — auth endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  handler: (req, res) => tooManyRequests(res, 'Too many login attempts. Please try again after 15 minutes.'),
});

/**
 * Rate limiter — LOGIN brute-force defense (strict).
 * Window: exactly 15 minutes. Threshold: max 5 attempts per IP.
 * On breach, rejects with HTTP 429 BEFORE the request reaches the controller
 * (and therefore before any database lookup), using the exact JSON contract
 * expected by the client: { status: false, message: "..." }.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,                    // 5 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    status: false,
    message: 'Too many login attempts from this device. Please try again after 15 minutes.',
  }),
});

/**
 * Rate limiter — OTP endpoints
 */
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  handler: (req, res) => tooManyRequests(res, 'Too many OTP requests. Please wait 10 minutes.'),
});

/**
 * Rate limiter — KYC identity validation (PAN verify) endpoints.
 *
 * Separate from otpLimiter so onboarding PAN lookups get an appropriate,
 * relaxed ceiling (correcting typos / moving between steps must not lock a
 * user out) AND a correct, identity-flavoured message — the OTP wording was
 * leaking onto PAN entry. Still throttled because the endpoint proxies a
 * metered third-party (Cashfree) and is reachable before auth.
 */
const panVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // ~30 attempts/window — generous for typo retries
  handler: (req, res) => tooManyRequests(res, 'Too many validation attempts. Please slow down and try again shortly.'),
});

/**
 * Rate limiter — transfer endpoints
 */
const transferLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  handler: (req, res) => tooManyRequests(res, 'Too many transfer attempts. Please wait 1 minute.'),
});

/**
 * Helmet security headers
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      // api.qrserver.com renders the deposit-page UPI QR image.
      imgSrc: ["'self'", 'data:', 'blob:', 'https://api.qrserver.com'],
      // checkout.razorpay.com serves the Razorpay Checkout widget script.
      scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
      // Razorpay Checkout makes XHR/fetch calls to its API + analytics hosts.
      // The split frontend (alisterbank.online) calls the API on its own
      // subdomain (api.alisterbank.online), so that origin must be allowed
      // here or the browser blocks every API request with (blocked:csp).
      connectSrc: [
        "'self'",
        ...(process.env.API_PUBLIC_URL ? [process.env.API_PUBLIC_URL] : ['https://api.alisterbank.online']),
        'https://api.razorpay.com',
        'https://checkout.razorpay.com',
        'https://rzp.io',
      ],
      // Razorpay Checkout renders its payment UI inside an iframe.
      frameSrc: ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://rzp.io'],
      mediaSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * Request sanitization middleware
 */
const sanitizeRequest = (req, res, next) => {
  // Strip MongoDB-like operators from query params (protection layer)
  const sanitize = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    for (const key in obj) {
      if (key.startsWith('$') || key.startsWith('{')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      } else if (typeof obj[key] === 'string') {
        // Basic XSS stripping
        obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    }
    return obj;
  };
  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  next();
};

/**
 * Add security-related response headers
 */
const securityResponseHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  next();
};

module.exports = {
  apiLimiter,
  authLimiter,
  loginLimiter,
  otpLimiter,
  panVerifyLimiter,
  transferLimiter,
  securityHeaders,
  sanitizeRequest,
  securityResponseHeaders,
  hpp,
};
