const jwt = require('jsonwebtoken');
const User = require('../models/User');
const eventPublisher = require('./eventPublisher');
const {
  generateAccessToken,
  generateRefreshToken
} = require('../utils/helpers');
const { createError } = require('../utils/errors');

class AuthService {
  async register(payload) {
    const existingUser = await User.findOne({ email: payload.email });
    if (existingUser) {
      throw createError('Email already registered', 409);
    }

    if (!['Rédacteur', 'Lecteur'].includes(payload.role)) {
      throw createError('Invalid role for signup', 403);
    }

    const user = await User.create(payload);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    await eventPublisher.publishNotification({
      userId: user._id,
      type: 'user.registered',
      message: `Welcome ${user.username}!`
    });

    return { user, accessToken, refreshToken };
  }

  async login(email, password) {
    const user = await User.findOne({ email });
    if (!user) {
      throw createError('Invalid credentials', 401);
    }

    if (!user.verified) {
      throw createError('Email not verified', 403);
    }

    if (!user.isActive) {
      throw createError('Account is inactive', 403);
    }

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      throw createError('Invalid credentials', 401);
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { user, accessToken, refreshToken };
  }

  async refreshToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user || user.refreshToken !== token) {
        throw createError('Invalid refresh token', 401);
      }

      const accessToken = generateAccessToken(user);
      const newRefreshToken = generateRefreshToken(user);

      user.refreshToken = newRefreshToken;
      await user.save({ validateBeforeSave: false });

      return { user, accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      throw createError('Invalid refresh token', 401);
    }
  }

  async resetPassword({
    user,
    password,
    confirmPassword
  }) {
    if (password !== confirmPassword) {
      throw createError('Passwords must match', 400);
    }

    if (!user) {
      throw createError('User not found', 404);
    }

    const isSamePassword = await user.comparePassword(password);
    if (isSamePassword) {
      throw createError('This password was already used. Please choose a new one.', 400);
    }

    user.password = password;
    user.refreshToken = null;
    if (typeof user.passwordResetToken !== 'undefined') {
      user.passwordResetToken = null;
    }
    if (typeof user.passwordResetExpiresAt !== 'undefined') {
      user.passwordResetExpiresAt = null;
    }
    await user.save();

    return { message: 'Password reset successfully' };
  }

  async logout(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw createError('User not found', 404);
    }

    user.refreshToken = null;
    await user.save({ validateBeforeSave: false });

    return { message: 'Logged out successfully' };
  }

  async changePassword({
    user,
    oldPassword,
    newPassword,
    confirmPassword
  }) {
    if (!user) {
      throw createError('User not found', 404);
    }

    if (!oldPassword || !newPassword || !confirmPassword) {
      throw createError('All password fields are required', 400);
    }

    // Verify old password
    const isOldPasswordCorrect = await user.comparePassword(oldPassword);
    if (!isOldPasswordCorrect) {
      throw createError('Old password is incorrect', 400);
    }

    // Check if new password matches confirm password
    if (newPassword !== confirmPassword) {
      throw createError('New passwords must match', 400);
    }

    // Check if new password is same as old password
    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      throw createError('New password must be different from old password', 400);
    }

    // Update password
    user.password = newPassword;
    await user.save();

    return { message: 'Password changed successfully' };
  }
}

module.exports = new AuthService();
