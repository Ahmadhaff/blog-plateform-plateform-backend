const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Optional authentication middleware
 * Tries to authenticate if token is provided, but doesn't fail if no token
 * Sets req.user if authenticated, otherwise req.user remains undefined
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // If no auth header, continue without authentication (guest access)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);

    // If user exists and is active, attach to request
    if (user && user.isActive) {
      req.user = user;
    }

    // Continue regardless of authentication result
    return next();
  } catch (error) {
    // If token is invalid, continue without authentication (guest access)
    // Don't fail the request, just don't set req.user
    return next();
  }
};

module.exports = optionalAuth;

