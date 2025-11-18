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
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, '');
  }
  
  // In production, always use HTTPS. Check for X-Forwarded-Proto header (from proxies like Render)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  // Use X-Forwarded-Host if available (from proxies like Render), otherwise use host header
  const host = req.headers['x-forwarded-host'] || req.get('host');
  
  // If host contains 'localhost' or '127.0.0.1', use http (development)
  // Otherwise, use https (production)
  // Force HTTPS if NODE_ENV is production OR if host is from Render.com (.onrender.com)
  const isLocalhost = host && (host.includes('localhost') || host.includes('127.0.0.1'));
  const isRender = host && host.includes('.onrender.com');
  const isProduction = process.env.NODE_ENV === 'production' || isRender;
  
  // If host is localhost but we're in production, use the forwarded host
  let finalHost = host;
  if (isLocalhost && isProduction) {
    // In production but host is localhost - try to get real host from forwarded headers
    // Prefer X-Forwarded-Host (from Render.com proxy), then try other headers
    finalHost = req.headers['x-forwarded-host'] || 
                req.headers.host || 
                host;
    
    // If still localhost, try to extract from request URL or use known production pattern
    if (finalHost && finalHost.includes('localhost')) {
      // Try to get host from the request URL if available
      // Or construct from known Render.com pattern if we detect it's a Render deployment
      if (process.env.RENDER) {
        // Running on Render.com - construct URL from service name
        const serviceName = process.env.RENDER_SERVICE_NAME || 'blog-plateform-plateform-backend';
        finalHost = `${serviceName}.onrender.com`;
      } else {
        // Not on Render - log warning and use HTTPS with localhost (will fail but prevents Mixed Content)
        console.warn('⚠️ [getBaseUrl] Detected localhost in production environment. Please set APP_BASE_URL. Host:', host, 'Headers:', {
          'x-forwarded-host': req.headers['x-forwarded-host'],
          'x-forwarded-proto': req.headers['x-forwarded-proto'],
          origin: req.headers.origin,
          referer: req.headers.referer
        });
        // Keep localhost but will force HTTPS below
        finalHost = host;
      }
    }
  }
  
  // Force HTTPS in production, regardless of localhost detection
  const isHttps = protocol === 'https' || (!isLocalhost && isProduction) || (isLocalhost && isProduction);
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
