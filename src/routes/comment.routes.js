const express = require('express');
const commentController = require('../controllers/commentController');
const auth = require('../middleware/auth');
const {
  createCommentValidator,
  updateCommentValidator,
  validate
} = require('../middleware/validator');

const router = express.Router();

// GET /api/comments/article/:articleId - Get all comments for an article (public)
router.get('/article/:articleId', commentController.getByArticle);

// POST /api/comments - Create a new comment (auth required)
router.post('/', auth, createCommentValidator, validate, commentController.create);

// PUT /api/comments/:id - Update a comment (auth required, author only)
router.put('/:id', auth, updateCommentValidator, validate, commentController.update);

// DELETE /api/comments/:id - Delete a comment (auth required, author or Admin)
router.delete('/:id', auth, commentController.delete);

// POST /api/comments/:id/like - Toggle like on a comment (auth required)
router.post('/:id/like', auth, commentController.toggleLike);

module.exports = router;
