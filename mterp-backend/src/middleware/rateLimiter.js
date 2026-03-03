const rateLimit = require('express-rate-limit');

// Rate limiter for file/document uploads
// Max 10 uploads per user per 15-minute window
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: (req) => {
    // Rate limit per authenticated user (fall back to IP)
    return req.user?._id?.toString() || req.ip;
  },
  message: { msg: 'Too many uploads. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for auth endpoints (login, register)
// Max 10 attempts per IP per 15-minute window
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { msg: 'Too many attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { uploadLimiter, authLimiter };
