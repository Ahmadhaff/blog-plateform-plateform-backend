const Comment = require('../models/Comment');
const Article = require('../models/Article');
const eventPublisher = require('../services/eventPublisher');
const { notifyCommentCreated } = require('../services/commentNotificationService');
const { createError } = require('../utils/errors');

const getBaseUrl = (req) => {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, '');
  }
  
  // In production, always use HTTPS. Check for X-Forwarded-Proto header (from proxies like Render)
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  
  // If host contains 'localhost' or '127.0.0.1', use http (development)
  // Otherwise, use https (production)
  const isLocalhost = host && (host.includes('localhost') || host.includes('127.0.0.1'));
  const isHttps = protocol === 'https' || (!isLocalhost && process.env.NODE_ENV === 'production');
  const finalProtocol = isHttps ? 'https' : 'http';
  
  return `${finalProtocol}://${host}`;
};

// Format comment response with full avatar URL
const formatCommentResponse = (req, commentDoc) => {
  if (!commentDoc) {
    return null;
  }

  const comment = commentDoc.toObject ? commentDoc.toObject({ virtuals: true }) : { ...commentDoc };
  const baseUrl = getBaseUrl(req);

  // Format author with full avatar URL
  if (comment.author && (comment.author.toObject || typeof comment.author === 'object')) {
    const author = comment.author.toObject ? comment.author.toObject({ virtuals: true }) : { ...comment.author };
    const timestamp = Date.now();
    const avatarUrl = author.avatar
      ? `${baseUrl}/api/users/${author._id}/avatar?t=${timestamp}`
      : null;

    comment.author = {
      _id: author._id ? author._id.toString() : author._id,
      username: author.username,
      avatar: avatarUrl || null,
      role: author.role || null
    };
  }

  // Format replies recursively if they exist
  if (comment.replies && Array.isArray(comment.replies)) {
    comment.replies = comment.replies.map(reply => formatCommentResponse(req, reply));
  }

  return comment;
};

// Create a new comment
const create = async (req, res, next) => {
  try {
    const { content, articleId, parentCommentId } = req.body;
    const authorId = req.user._id;

    // Verify article exists
    const article = await Article.findById(articleId);
    if (!article) {
      throw createError('Article not found', 404);
    }

    // If parentCommentId is provided, verify it exists and belongs to the same article
    if (parentCommentId) {
      const parentComment = await Comment.findById(parentCommentId);
      if (!parentComment) {
        throw createError('Parent comment not found', 404);
      }
      if (parentComment.article.toString() !== articleId.toString()) {
        throw createError('Parent comment does not belong to this article', 400);
      }
    }

    // Create the comment
    const comment = await Comment.create({
      content,
      author: authorId,
      article: articleId,
      parentComment: parentCommentId || null,
      likes: [],
      isDeleted: false
    });

    // Populate author and article information
    await comment.populate('author', 'username avatar role');
    await comment.populate({
      path: 'article',
      select: 'title author',
      populate: {
        path: 'author',
        select: '_id username'
      }
    });

    // Send notifications for the comment
    try {
      await notifyCommentCreated(comment, parentCommentId || null);
    } catch (notificationError) {
      // Log error but don't fail the request - comment is already saved
      console.error('❌ Error sending comment notifications:', notificationError);
    }

    // Publish event AFTER saving to database
    // This ensures the comment exists when the WebSocket server tries to load it
    try {
      await eventPublisher.publishCommentCreated({
        commentId: comment._id,
        articleId: articleId,
        authorId: authorId,
        content: comment.content,
        parentCommentId: parentCommentId || null,
        articleAuthorId: article.author._id || article.author
      });
    } catch (eventError) {
      // Log error but don't fail the request - comment is already saved
      console.error('❌ Error publishing comment event:', eventError);
    }

    res.status(201).json({
      message: 'Comment created',
      comment: formatCommentResponse(req, comment)
    });
  } catch (error) {
    console.error('❌ Error creating comment:', error);
    next(error);
  }
};

// Get all comments for an article
const getByArticle = async (req, res, next) => {
  try {
    const { articleId } = req.params;

    // Get all root comments (not replies) for the article
    const comments = await Comment.find({
      article: articleId,
      parentComment: null,
      isDeleted: false
    })
      .populate('author', 'username avatar')
      .sort({ createdAt: 1 })
      .lean();

    // For each comment, get its replies recursively
    const populateReplies = async (comment) => {
      const replies = await Comment.find({
        parentComment: comment._id,
        isDeleted: false
      })
        .populate('author', 'username avatar')
        .sort({ createdAt: 1 })
        .lean();

      // Recursively populate nested replies
      for (const reply of replies) {
        reply.replies = await populateReplies(reply);
      }

      return replies;
    };

    // Populate replies for each root comment
    for (const comment of comments) {
      comment.replies = await populateReplies(comment);
    }

    // Format all comments with full avatar URLs
    const formattedComments = comments.map(comment => formatCommentResponse(req, comment));

    res.json({ comments: formattedComments });
  } catch (error) {
    console.error('❌ Error fetching comments:', error);
    next(error);
  }
};

// Update a comment
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    // Find the comment
    const comment = await Comment.findById(id);
    if (!comment) {
      throw createError('Comment not found', 404);
    }

    // Check ownership - only the author can edit their comment
    if (comment.author.toString() !== req.user._id.toString()) {
      throw createError('You can only edit your own comments', 403);
    }

    // Update the comment
    comment.content = content;
    await comment.save();

    // Populate author information
    await comment.populate('author', 'username avatar');

    // Populate article to get articleId for event
    await comment.populate('article', '_id');

    // Publish event AFTER saving to database
    try {
      await eventPublisher.publishCommentUpdated({
        commentId: comment._id,
        articleId: comment.article._id || comment.article,
        content: comment.content
      });
    } catch (eventError) {
      // Log error but don't fail the request - comment is already updated
      console.error('❌ Error publishing comment update event:', eventError);
    }

    res.json({
      message: 'Comment updated',
      comment: formatCommentResponse(req, comment)
    });
  } catch (error) {
    console.error('❌ Error updating comment:', error);
    next(error);
  }
};

// Delete a comment (soft delete)
const deleteComment = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find the comment
    const comment = await Comment.findById(id);
    if (!comment) {
      throw createError('Comment not found', 404);
    }

    // Check permissions - author or Admin can delete
    const isAuthor = comment.author.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'Admin';

    if (!isAuthor && !isAdmin) {
      throw createError('Only the author or Admin can delete comments', 403);
    }

    // Populate article before soft delete to get articleId for event
    await comment.populate('article', '_id');
    const articleId = comment.article._id || comment.article;

    // Soft delete
    comment.isDeleted = true;
    await comment.save();

    // Publish event AFTER saving to database
    try {
      await eventPublisher.publishCommentDeleted({
        commentId: comment._id,
        articleId: articleId
      });
    } catch (eventError) {
      // Log error but don't fail the request - comment is already deleted
      console.error('❌ Error publishing comment delete event:', eventError);
    }

    res.json({
      message: 'Comment deleted'
    });
  } catch (error) {
    console.error('❌ Error deleting comment:', error);
    next(error);
  }
};

// Toggle like on a comment
const toggleLike = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Find the comment
    const comment = await Comment.findById(id);
    if (!comment) {
      throw createError('Comment not found', 404);
    }

    // Check if user already liked the comment
    const likeIndex = comment.likes.findIndex(
      likeId => likeId.toString() === userId.toString()
    );

    let message;
    const isLiked = likeIndex === -1; // Will be true if user is liking (not already liked)
    
    if (likeIndex > -1) {
      // Unlike - remove from array
      comment.likes.splice(likeIndex, 1);
      message = 'Like removed';
    } else {
      // Like - add to array
      comment.likes.push(userId);
      message = 'Comment liked';
    }

    await comment.save();

    // Populate author and article for notifications
    await comment.populate('author', 'username avatar');
    await comment.populate({
      path: 'article',
      select: 'title _id'
    });

    // Send notification if comment was liked (not unliked)
    if (isLiked) {
      try {
        const { notifyCommentLiked } = require('../services/commentLikeNotificationService');
        await notifyCommentLiked(comment, userId, req.user.username, isLiked);
      } catch (notificationError) {
        // Log error but don't fail the request - like is already saved
        console.error('❌ Error sending comment like notification:', notificationError);
      }
    }

    // Publish event AFTER saving to database
    try {
      await eventPublisher.publishCommentLiked({
        commentId: comment._id,
        articleId: comment.article._id || comment.article,
        userId: userId.toString(),
        likes: comment.likes.length,
        isLiked: isLiked
      });
    } catch (eventError) {
      // Log error but don't fail the request - like is already saved
      console.error('❌ Error publishing comment like event:', eventError);
    }

    res.json({
      message,
      likes: comment.likes.length
    });
  } catch (error) {
    console.error('❌ Error toggling like:', error);
    next(error);
  }
};

module.exports = {
  create,
  getByArticle,
  update,
  delete: deleteComment,
  toggleLike
};
