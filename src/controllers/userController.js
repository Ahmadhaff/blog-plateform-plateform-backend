const User = require('../models/User');
const { buildPagination } = require('../utils/helpers');
const { createError } = require('../utils/errors');
const { uploadFile, deleteFile, getFileStream } = require('../config/gridfs');

const getBaseUrl = (req) => {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, '');
  }
  
  // In production, always use HTTPS. Check for X-Forwarded-Proto header (from proxies like Render)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  
  // If host contains 'localhost' or '127.0.0.1', use http (development)
  // Otherwise, use https (production)
  // Force HTTPS if NODE_ENV is production OR if host is from Render.com (.onrender.com)
  const isLocalhost = host && (host.includes('localhost') || host.includes('127.0.0.1'));
  const isRender = host && host.includes('.onrender.com');
  const isProduction = process.env.NODE_ENV === 'production' || isRender;
  const isHttps = protocol === 'https' || (!isLocalhost && isProduction);
  const finalProtocol = isHttps ? 'https' : 'http';
  
  return `${finalProtocol}://${host}`;
};

const formatUserResponse = (req, user) => {
  if (!user) {
    return null;
  }

  const userObj = user.toObject ? user.toObject({ virtuals: true }) : { ...user };
  const baseUrl = getBaseUrl(req);
  
  // Construct avatar URL if avatar fileId exists
  // Add timestamp for cache-busting to ensure new avatar shows immediately
  const timestamp = Date.now();
  const avatarUrl = userObj.avatar
    ? `${baseUrl}/api/users/${userObj._id}/avatar?t=${timestamp}`
    : null;

  return {
    ...userObj,
    avatar: avatarUrl || userObj.avatar || null
  };
};

const getProfile = (req, res) => {
  const formattedUser = formatUserResponse(req, req.user);
  res.json({ user: formattedUser });
};

const updateProfile = async (req, res, next) => {
  try {
    const updates = {
      username: req.body.username
      // Note: avatar is updated separately via uploadAvatar endpoint
    };

    Object.keys(updates).forEach((key) => updates[key] === undefined && delete updates[key]);

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });

    const formattedUser = formatUserResponse(req, user);

    res.json({
      message: 'Profile updated',
      user: formattedUser
    });
  } catch (error) {
    next(error);
  }
};

const changeRole = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      throw createError('User not found', 404);
    }

    user.role = req.body.role;
    await user.save();

    res.json({
      message: 'Role updated',
      user
    });
  } catch (error) {
    next(error);
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req);

    const [users, total] = await Promise.all([
      User.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments()
    ]);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      users
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      throw createError('User not found', 404);
    }

    user.isActive = false;
    await user.save();

    res.json({ message: 'User deactivated' });
  } catch (error) {
    next(error);
  }
};

const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      throw createError('Avatar file is required', 400);
    }

    if (!req.file.mimetype.startsWith('image/')) {
      throw createError('Only image files are allowed', 400);
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      throw createError('User not found', 404);
    }

    // Delete old avatar if exists
    if (user.avatar) {
      try {
        await deleteFile(user.avatar, 'avatars');
      } catch (deleteError) {
        console.error('❌ Error deleting old avatar:', deleteError);
        // Continue even if deletion fails
      }
    }

    // Upload new avatar
    let uploadedFile;
    try {
      uploadedFile = await uploadFile(req.file, 'avatars');
    } catch (fileError) {
      console.error('❌ Error uploading avatar:', fileError);
      throw createError('Failed to upload avatar', 500);
    }

    if (!uploadedFile || !uploadedFile._id) {
      console.error('❌ GridFS upload returned invalid file metadata', uploadedFile);
      throw createError('Failed to upload avatar', 500);
    }

    // Store fileId in user.avatar field
    user.avatar = uploadedFile._id.toString();
    await user.save();

    const formattedUser = formatUserResponse(req, user);

    res.json({
      message: 'Avatar uploaded successfully',
      user: formattedUser
    });
  } catch (error) {
    next(error);
  }
};

const streamAvatar = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('avatar');
    if (!user || !user.avatar) {
      return res.status(404).json({ error: 'Avatar not found' });
    }

    try {
      const readStream = getFileStream(user.avatar, 'avatars');
      
      // Set appropriate headers
      // Use no-cache to ensure fresh avatar is always loaded when URL changes
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Content-Type', 'image/jpeg'); // Default to jpeg, could be enhanced to detect actual type
      
      // Sanitize filename for Content-Disposition header
      const safeFilename = `avatar-${userId}.jpg`.replace(/[^a-zA-Z0-9.-]/g, '');
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
      
      readStream.on('error', (error) => {
        console.error('❌ Error streaming avatar:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to stream avatar' });
        }
      });

      readStream.pipe(res);
    } catch (streamError) {
      console.error('❌ Error creating avatar stream:', streamError);
      res.status(500).json({ error: 'Failed to stream avatar' });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changeRole,
  getAllUsers,
  deleteUser,
  uploadAvatar,
  streamAvatar
};
