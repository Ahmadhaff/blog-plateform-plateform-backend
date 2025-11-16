const express = require('express');
const multer = require('multer');
const articleController = require('../controllers/articleController');
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const {
  canCreateArticle,
  canModifyArticle,
  canDeleteArticle,
  hasRole
} = require('../middleware/permissions');
const {
  createArticleValidator,
  updateArticleValidator,
  validate
} = require('../middleware/validator');
// const { createArticleLimiter } = require('../middleware/rateLimiter');
const parseFormData = require('../middleware/parseFormData');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

const router = express.Router();

// Public routes
router.get('/', articleController.getAll);
router.get('/:id/image', articleController.streamImage);
// Optional auth allows both guests and authenticated users to access
router.get('/:id', optionalAuth, articleController.getById);

// Protected routes
router.post(
  '/',
  auth,
  canCreateArticle,
  // createArticleLimiter, // Rate limiter commented out for now
  upload.single('image'),
  parseFormData, // Parse FormData fields (tags as JSON string) before validation
  createArticleValidator,
  validate,
  articleController.create
);

router.put(
  '/:id',
  auth,
  canModifyArticle,
  upload.single('image'),
  parseFormData, // Parse FormData fields (tags as JSON string) before validation
  updateArticleValidator,
  validate,
  articleController.update
);

router.delete(
  '/:id',
  auth,
  canDeleteArticle,
  articleController.delete
);

router.get(
  '/my/articles',
  auth,
  hasRole('Rédacteur', 'Éditeur', 'Admin'),
  articleController.getMyArticles
);

router.get(
  '/my/stats',
  auth,
  hasRole('Rédacteur', 'Éditeur', 'Admin'),
  articleController.getMyStats
);

router.post(
  '/:id/like',
  auth,
  articleController.toggleLike
);

router.patch(
  '/:id/status',
  auth,
  canModifyArticle,
  articleController.changeStatus
);

module.exports = router;
