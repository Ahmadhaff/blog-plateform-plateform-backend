const express = require('express');
const multer = require('multer');
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const {
  canManageRoles,
  hasRole
} = require('../middleware/permissions');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB for avatars
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const router = express.Router();

// Protected routes (specific routes first to avoid conflicts)
router.get('/me', auth, userController.getProfile);
router.put('/me', auth, userController.updateProfile);
router.post('/me/avatar', auth, upload.single('avatar'), userController.uploadAvatar);

// Admin routes
router.get('/', auth, hasRole('Admin'), userController.getAllUsers);
router.patch('/:userId/role', auth, canManageRoles, userController.changeRole);
router.delete('/:userId', auth, canManageRoles, userController.deleteUser);

// Public route - stream user avatar (must be last to avoid conflicts)
router.get('/:userId/avatar', userController.streamAvatar);

module.exports = router;
