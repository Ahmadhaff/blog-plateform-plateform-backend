const mongoose = require('mongoose');
const { OTP_TYPES } = require('../enums');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true
  },
  code: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: Object.values(OTP_TYPES),
    default: OTP_TYPES.EMAIL_VERIFICATION,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);

