const User = require('../models/User');
const Notification = require('../models/Notification');
const eventPublisher = require('./eventPublisher');

/**
 * Send notifications when a comment is created
 * Notifies:
 * - Article author (if commenter is not the author)
 * - Parent comment author (if it's a reply and commenter is not the parent author)
 * @param {object} comment - Comment document with populated author and article
 * @param {string} parentCommentId - Parent comment ID if this is a reply
 */
const notifyCommentCreated = async (comment, parentCommentId = null) => {
  try {
    const commenterId = comment.author._id || comment.author;
    const commenterIdString = commenterId?.toString ? commenterId.toString() : String(commenterId);
    const commenterUsername = comment.author?.username || 'Someone';
    
    const article = comment.article;
    const articleId = article._id?.toString ? article._id.toString() : String(article._id);
    const articleTitle = article.title || 'Untitled Article';
    const articleAuthorId = article.author?._id || article.author;
    const articleAuthorIdString = articleAuthorId?.toString ? articleAuthorId.toString() : String(articleAuthorId);

    const notifications = [];

    // Notify article author if commenter is not the author
    if (commenterIdString !== articleAuthorIdString) {
      notifications.push({
        user: articleAuthorId,
        type: 'new_comment',
        title: 'New Comment on Your Article',
        message: `${commenterUsername} commented on your article: "${articleTitle}"`,
        data: {
          articleId,
          articleTitle,
          commentId: comment._id.toString(),
          commenterId: commenterIdString,
          commenterUsername,
          isReply: !!parentCommentId
        },
        read: false
      });
    }

    // If it's a reply, notify parent comment author
    // Always notify the parent comment author when someone replies to their comment
    // This ensures they know someone specifically replied to their comment,
    // even if they're also the article author (they'll get both notifications)
    if (parentCommentId) {
      const Comment = require('../models/Comment');
      const parentComment = await Comment.findById(parentCommentId)
        .populate('author', '_id username');

      if (parentComment && parentComment.author) {
        const parentAuthorId = parentComment.author._id || parentComment.author;
        const parentAuthorIdString = parentAuthorId?.toString ? parentAuthorId.toString() : String(parentAuthorId);

        // Notify parent comment author if they're not the commenter
        // We notify even if they're the article author, so they get both:
        // 1. "New comment on your article" (from above)
        // 2. "Reply to your comment" (from here)
        // This way they know someone specifically replied to their comment
        if (parentAuthorIdString !== commenterIdString) {
          notifications.push({
            user: parentAuthorId,
            type: 'comment_reply',
            title: 'Reply to Your Comment',
            message: `${commenterUsername} replied to your comment on "${articleTitle}"`,
            data: {
              articleId,
              articleTitle,
              commentId: comment._id.toString(),
              parentCommentId: parentCommentId.toString(),
              commenterId: commenterIdString,
              commenterUsername
            },
            read: false
          });
        }
      }
    }

    if (notifications.length === 0) {
      return;
    }

    // Bulk insert notifications
    const savedNotifications = await Notification.insertMany(notifications);

    // Publish notification events via RabbitMQ/Redis for real-time socket delivery
    for (const notification of savedNotifications) {
      const notificationData = {
        userId: notification.user.toString(),
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        notificationId: notification._id.toString(),
        articleId: articleId,
        commentId: notification.data.commentId
      };

      await eventPublisher.publishNotification(notificationData);
    }

    return {
      notificationsSent: notifications.length
    };
  } catch (error) {
    console.error('❌ Error sending comment notifications:', error);
    // Don't throw error - we don't want to break the comment creation flow
    return null;
  }
};

module.exports = {
  notifyCommentCreated
};

