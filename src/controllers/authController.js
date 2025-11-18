const authService = require('../services/authService');
const { createError } = require('../utils/errors');

const register = async (req, res, next) => {
  try {
    const { user, accessToken, refreshToken } = await authService.register(req.body);
    res.status(201).json({
      message: 'Registration successful',
      user,
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { user, accessToken, refreshToken } = await authService.login(req.body.email, req.body.password);
    res.json({
      message: 'Login successful',
      user,
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to format user response (imported from userController pattern)
const getBaseUrl = (req) => {
  // Always use APP_BASE_URL if set (recommended for production)
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, '');
  }
  
  // Check if we're running on Render.com (production)
  // Render.com sets RENDER environment variable, or we can check for .onrender.com in host
  const host = req.headers['x-forwarded-host'] || req.get('host') || '';
  const isRender = process.env.RENDER === 'true' || host.includes('.onrender.com');
  const isProduction = process.env.NODE_ENV === 'production' || isRender;
  
  // If we're in production, always use the Render.com URL, never localhost
  if (isProduction) {
    const serviceName = process.env.RENDER_SERVICE_NAME || 'blog-plateform-plateform-backend';
    const productionHost = `${serviceName}.onrender.com`;
    
    // If host is localhost or not the production host, log and use production URL
    if (!host || host.includes('localhost') || host.includes('127.0.0.1') || !host.includes('.onrender.com')) {
      console.log(`⚠️ [getBaseUrl] Production detected but host was '${host}', using: https://${productionHost}`);
      return `https://${productionHost}`;
    }
    
    // Host is already correct production host, ensure HTTPS
    return `https://${host}`;
  }
  
  // Development mode - use request protocol and host
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const finalHost = host || 'localhost:3000';
  const isHttps = protocol === 'https';
  const finalProtocol = isHttps ? 'https' : 'http';
  
  return `${finalProtocol}://${finalHost}`;
};

const formatUserResponse = (req, user) => {
  if (!user) {
    return null;
  }

  const userObj = user.toObject ? user.toObject({ virtuals: true }) : { ...user };
  const baseUrl = getBaseUrl(req);
  
  // Construct avatar URL if avatar fileId exists
  // Add timestamp for cache-busting to ensure fresh avatar is loaded
  const timestamp = Date.now();
  const avatarUrl = userObj.avatar
    ? `${baseUrl}/api/users/${userObj._id}/avatar?t=${timestamp}`
    : null;

  return {
    ...userObj,
    avatar: avatarUrl || userObj.avatar || null
  };
};

const refreshToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      throw createError('Refresh token is required', 400);
    }

    const result = await authService.refreshToken(token);
    
    // Format user response with avatar URL
    const formattedUser = formatUserResponse(req, result.user);
    
    res.json({
      message: 'Tokens refreshed',
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: formattedUser
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const response = await authService.logout(req.user._id);
    res.json(response);
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const {
      password,
      confirmPassword
    } = req.body;
    const result = await authService.resetPassword({
      user: req.user,
      password,
      confirmPassword
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const result = await authService.changePassword({
      user: req.user,
      oldPassword,
      newPassword,
      confirmPassword
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  resetPassword,
  changePassword
};
