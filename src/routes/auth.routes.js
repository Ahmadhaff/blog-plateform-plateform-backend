const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
// const { authLimiter, registerLimiter } = require('../middleware/rateLimiter');
const {
  registerValidator,
  loginValidator,
  sendOtpValidator,
  verifyOtpValidator,
  resetPasswordValidator,
  changePasswordValidator,
  validate
} = require('../middleware/validator');

const router = express.Router();

// Rate limiters commented out for now
router.post('/register', /* registerLimiter, */ registerValidator, validate, authController.register);
router.post('/login', /* authLimiter, */ loginValidator, validate, authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', authMiddleware, authController.logout);
router.post('/otp/send', /* authLimiter, */ sendOtpValidator, validate, authController.sendOtp);
router.post('/otp/verify', /* authLimiter, */ verifyOtpValidator, validate, authController.verifyOtp);
router.post('/reset-password', /* authLimiter, */ authMiddleware, resetPasswordValidator, validate, authController.resetPassword);
router.post('/change-password', /* authLimiter, */ authMiddleware, changePasswordValidator, validate, authController.changePassword);

module.exports = router;
