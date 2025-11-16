const rateLimit = require('express-rate-limit');

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const maxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 10000; // Increased from 2000

const apiLimiter = rateLimit({
  windowMs,
  max: maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Increased rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 1000, // Allow 1000 requests per 15 minutes (increased from 300)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' }
});

// Increased limiter for registration
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 500, // Allow 500 registration attempts per 15 minutes (increased from 200)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts, please try again later.' }
});

const createArticleLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 1000, // Allow 1000 article creations per hour (increased from 300)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Article creation rate limit exceeded.' }
});

module.exports = {
  apiLimiter,
  authLimiter,
  registerLimiter,
  createArticleLimiter
};
