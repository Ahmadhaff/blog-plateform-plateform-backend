const jwt = require('jsonwebtoken');

const generateAccessToken = (user, expiresIn = null) => {
  // Use environment variable or default to 15 minutes
  const finalExpiry = expiresIn || process.env.JWT_EXPIRES_IN || '15m';
  
  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
      username: user.username
    },
    process.env.JWT_SECRET,
    {
      expiresIn: finalExpiry
    }
  );
};

const generateRefreshToken = (user) => {
  // Use environment variable or default to 7 days
  const finalExpiry = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  
  return jwt.sign(
    {
      userId: user._id
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: finalExpiry
    }
  );
};

const buildPagination = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  buildPagination
};
