const Notification = require('../models/Notification');
const eventPublisher = require('./eventPublisher');

/**
 * Send notifications when a comment is liked
 * Notifies the comment author (if liker is not the author)
 * @param {object} comment - Comment document with populated author and article
 * @param {string} likerId - ID of the user who liked the comment
 * @param {string} likerUsername - Username of the user who liked the comment
 * @param {boolean} isLiked - True if comment was liked, false if unliked
 */
const notifyCommentLiked = async (comment, likerId, likerUsername, isLiked) => {
  try {
    // Only send notification when comment is liked (not when unliked)
    if (!isLiked) {
      return null;
    }

    const commentId = comment._id?.toString ? comment._id.toString() : String(comment._id);
    const commentAuthorId = comment.author?._id || comment.author;
    const commentAuthorIdString = commentAuthorId?.toString ? commentAuthorId.toString() : String(commentAuthorId);
    const likerIdString = likerId?.toString ? likerId.toString() : String(likerId);

    // Don't notify if the liker is the comment author
    if (likerIdString === commentAuthorIdString) {
      return null;
    }

    // Get article information for the notification
    const article = comment.article;
    const articleId = article._id?.toString ? article._id.toString() : String(article._id);
    const articleTitle = article.title || 'Untitled Article';

    // Truncate comment content for the notification message
    const commentContent = comment.content || '';
    const truncatedContent = commentContent.length > 50 
      ? commentContent.substring(0, 50) + '...' 
      : commentContent;

    // Create notification for the comment author
    const notification = await Notification.create({
      user: commentAuthorId,
      type: 'comment_liked',
      title: 'Your Comment Was Liked',
      message: `${likerUsername} liked your comment: "${truncatedContent}"`,
      data: {
        articleId,
        articleTitle,
        commentId,
        likerId: likerIdString,
        likerUsername
      },
      read: false
    });

    // Publish notification event via RabbitMQ/Redis for real-time socket delivery
    const notificationData = {
      userId: notification.user.toString(),
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      notificationId: notification._id.toString(),
      articleId: articleId,
      commentId: commentId
    };

    await eventPublisher.publishNotification(notificationData);

    return {
      notificationSent: true
    };
  } catch (error) {
    console.error('❌ Error sending comment like notification:', error);
    // Don't throw error - we don't want to break the like flow
    return null;
  }
};

module.exports = {
  notifyCommentLiked
};

