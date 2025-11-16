const Notification = require('../models/Notification');
const eventPublisher = require('./eventPublisher');

/**
 * Send notifications when an article is liked
 * Notifies the article author (if liker is not the author)
 * @param {object} article - Article document with populated author
 * @param {string} likerId - ID of the user who liked the article
 * @param {string} likerUsername - Username of the user who liked the article
 * @param {boolean} isLiked - True if article was liked, false if unliked
 */
const notifyArticleLiked = async (article, likerId, likerUsername, isLiked) => {
  try {
    // Only send notification when article is liked (not when unliked)
    if (!isLiked) {
      return null;
    }

    const articleId = article._id?.toString ? article._id.toString() : String(article._id);
    const articleTitle = article.title || 'Untitled Article';
    const articleAuthorId = article.author?._id || article.author;
    const articleAuthorIdString = articleAuthorId?.toString ? articleAuthorId.toString() : String(articleAuthorId);
    const likerIdString = likerId?.toString ? likerId.toString() : String(likerId);

    // Don't notify if the liker is the article author
    if (likerIdString === articleAuthorIdString) {
      return null;
    }

    // Create notification for the article author
    const notification = await Notification.create({
      user: articleAuthorId,
      type: 'article_liked',
      title: 'Your Article Was Liked',
      message: `${likerUsername} liked your article: "${articleTitle}"`,
      data: {
        articleId,
        articleTitle,
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
      articleId: articleId
    };

    await eventPublisher.publishNotification(notificationData);

    return {
      notificationSent: true
    };
  } catch (error) {
    console.error('❌ Error sending article like notification:', error);
    // Don't throw error - we don't want to break the like flow
    return null;
  }
};

module.exports = {
  notifyArticleLiked
};

