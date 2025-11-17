const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication token missing' });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token || token.trim().length === 0) {
      return res.status(401).json({ error: 'Authentication token missing' });
    }
    
    let decoded;
    try {
      // Try with platform-server's JWT_SECRET first
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      // If verification fails, try with admin-panel-server's JWT_SECRET (if provided)
      // This allows admin tokens to work with platform-server
      if (process.env.ADMIN_JWT_SECRET && error.name === 'JsonWebTokenError') {
        try {
          decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
        } catch (adminError) {
          // Both failed, return original error
          if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
          }
          if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
          }
          console.error(`❌ Auth middleware error:`, error);
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
      } else {
        // No ADMIN_JWT_SECRET or different error type, return original error
        if (error.name === 'TokenExpiredError') {
          return res.status(401).json({ error: 'Token expired' });
        }
        if (error.name === 'JsonWebTokenError') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        console.error(`❌ Auth middleware error:`, error);
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    if (!user.isActive) {
      return res.status(401).json({ error: 'User account is not active' });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error(`❌ Auth middleware error:`, error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = auth;
