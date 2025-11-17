const fs = require('fs/promises');
const path = require('path');
const bcrypt = require('bcryptjs');
const OTP = require('../models/Otp');
const User = require('../models/User');
const { getEmailTransporter } = require('../config/email');
const { createError } = require('../utils/errors');
const { OTP_TYPES } = require('../enums');
const { generateAccessToken } = require('../utils/helpers');
const { Resend } = require('resend');

const OTP_EXPIRATION_MINUTES = Number(process.env.OTP_EXPIRATION_MINUTES) || 10;
const OTP_TEMPLATE_PATH = path.join(__dirname, '../templates/otpEmail.html');
const PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES = 5;

let cachedOtpTemplate;

const getOtpTemplate = async () => {
  if (!cachedOtpTemplate) {
    cachedOtpTemplate = await fs.readFile(OTP_TEMPLATE_PATH, 'utf8');
  }
  return cachedOtpTemplate;
};

const renderOtpTemplate = (template, {
  code,
  expiresAt,
  expiresInMinutes,
  messageLine
}) => template
  .replace(/{{code}}/g, code)
  .replace(/{{expiresAt}}/g, expiresAt)
  .replace(/{{expiresInMinutes}}/g, String(expiresInMinutes))
  .replace(/{{messageLine}}/g, messageLine);

const isValidOtpType = (type) => Object.values(OTP_TYPES).includes(type);

class OtpService {
  async sendOtp(email, type = OTP_TYPES.EMAIL_VERIFICATION) {
    const normalizedEmail = email.toLowerCase();

    if (!isValidOtpType(type)) {
      throw createError('Invalid OTP type', 400);
    }

    if (type === OTP_TYPES.PASSWORD_RESET) {
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        throw createError('User not found', 404);
      }

      if (!user.verified) {
        throw createError('Email not verified', 403);
      }
    }

    const code = this.generateCode();
    const hashedCode = await bcrypt.hash(code, 10);

    await OTP.deleteMany({ email: normalizedEmail, type });

    const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);

    await OTP.create({
      email: normalizedEmail,
      code: hashedCode,
      type,
      expiresAt
    });

    await this.sendEmail(normalizedEmail, code, expiresAt, type);

    return {
      message: 'OTP sent successfully',
      expiresAt
    };
  }

  async verifyOtp(email, code, type = OTP_TYPES.EMAIL_VERIFICATION) {
    const normalizedEmail = email.toLowerCase();

    if (!isValidOtpType(type)) {
      throw createError('Invalid OTP type', 400);
    }

    const otpRecord = await OTP.findOne({ email: normalizedEmail, type });

    if (!otpRecord) {
      throw createError('OTP not found or expired', 404);
    }

    if (otpRecord.expiresAt < new Date()) {
      await otpRecord.deleteOne();
      throw createError('OTP has expired', 410);
    }

    const isMatch = await bcrypt.compare(code, otpRecord.code);
    if (!isMatch) {
      throw createError('Invalid OTP code', 401);
    }

    otpRecord.verified = true;
    await otpRecord.save({ validateBeforeSave: false });

    const user = await User.findOne({ email: normalizedEmail });

    if (type === OTP_TYPES.EMAIL_VERIFICATION && user) {
      user.verified = true;
      user.isActive = true;
      await user.save({ validateBeforeSave: false });
    }

    if (type === OTP_TYPES.PASSWORD_RESET) {
      if (!user) {
        throw createError('User not found', 404);
      }

      const resetAccessToken = generateAccessToken(user, `${PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES}m`);
      await OTP.deleteMany({ email: normalizedEmail, type });

      return {
        message: 'OTP verified successfully',
        token: resetAccessToken,
        expiresInMinutes: PASSWORD_RESET_TOKEN_EXPIRATION_MINUTES
      };
    }

    await OTP.deleteMany({ email: normalizedEmail, type });

    return {
      message: 'OTP verified successfully'
    };
  }

  generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendEmail(email, code, expiresAt, type) {
    try {
      const from = process.env.EMAIL_FROM || process.env.SMTP_USERNAME;
      if (!from) {
        throw new Error('EMAIL_FROM or SMTP_USERNAME must be set for sending emails');
      }

      const subject = type === OTP_TYPES.PASSWORD_RESET
        ? 'Reset your password'
        : 'Your verification code';
      const purposeLine = type === OTP_TYPES.PASSWORD_RESET
        ? 'Use this code to reset your password.'
        : 'Use this code to verify your email address.';
      const expiresAtDisplay = expiresAt.toLocaleString();
      const text = `Your verification code is ${code}. ${purposeLine} It expires in ${OTP_EXPIRATION_MINUTES} minutes at ${expiresAtDisplay}.`;
      const template = await getOtpTemplate();
      const html = renderOtpTemplate(template, {
        code,
        expiresAt: expiresAtDisplay,
        expiresInMinutes: OTP_EXPIRATION_MINUTES,
        messageLine: purposeLine
      });

      // Use Resend API if API key is available (more reliable than SMTP)
      if (process.env.RESEND_API_KEY) {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          
          console.log('📧 Attempting to send email via Resend API to:', email);
          
          const result = await resend.emails.send({
            from: from,
            to: email,
            subject: subject,
            text: text,
            html: html
          });

          if (result.error) {
            console.error('❌ Resend API error:', JSON.stringify(result.error, null, 2));
            throw createError(`Failed to send email via Resend: ${result.error.message || 'Unknown error'}`, 500);
          }

          console.log('✅ Email sent via Resend API:', result.data?.id);
          return;
        } catch (error) {
          console.error('❌ Resend API exception:', error);
          // If Resend fails, don't fall through to SMTP - throw the error
          throw createError(`Resend API error: ${error.message || 'Unable to send email'}`, 500);
        }
      }

      // Fallback to SMTP
      const transporter = getEmailTransporter();

      // Wrap sendMail in a Promise with timeout
      const sendMailPromise = transporter.sendMail({
        from,
        to: email,
        subject,
        text,
        html
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Email sending timeout: SMTP server did not respond within 15 seconds'));
        }, 15000); // 15 second timeout
      });

      await Promise.race([sendMailPromise, timeoutPromise]);
    } catch (error) {
      console.error('❌ Error sending email:', error);
      
      // Provide user-friendly error messages
      if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        throw createError('Email service timeout. Please check your SMTP configuration or try again later.', 503);
      }
      if (error.code === 'ECONNREFUSED') {
        throw createError('Cannot connect to email server. Please check your SMTP configuration.', 503);
      }
      if (error.code === 'EAUTH') {
        throw createError('Email authentication failed. Please check your SMTP credentials.', 401);
      }
      
      // Re-throw with a generic message
      throw createError('Failed to send email. Please try again later.', 500);
    }
  }
}

module.exports = new OtpService();

