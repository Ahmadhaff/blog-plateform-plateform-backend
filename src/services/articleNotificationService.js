const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendNewArticleNotification } = require('./notificationService');
const eventPublisher = require('./eventPublisher');

/**
 * Send notifications when an article is published
 * Notifies all users except the author, including Admin and Editor
 * @param {object} article - Article document with populated author
 * @param {string} previousStatus - Previous status of the article (to check if it's a new publication)
 */
const notifyArticlePublished = async (article, previousStatus = null) => {
  try {
    // Only send notifications if article is being published (not if it was already published)
    const isNewlyPublished = previousStatus !== 'published' && article.status === 'published';
    
    if (!isNewlyPublished) {
      return;
    }

    const authorId = article.author?._id || article.author;
    const authorIdString = authorId?.toString ? authorId.toString() : String(authorId);
    const authorUsername = article.author?.username || 'Unknown Author';
    const articleTitle = article.title;
    const articleId = article._id?.toString ? article._id.toString() : String(article._id);

    // Get all users except the author
    // Include Admin, Éditeur, Rédacteur, and Lecteur
    // Admin users should always be included regardless of verified/active status
    // Other users must be active and verified
    const users = await User.find({
      _id: { $ne: authorId },
      $or: [
        { role: 'Admin' }, // Always include Admin users
        { 
          isActive: true, 
          verified: true 
        }
      ]
    }).select('_id oneSignalPlayerId username role');

    if (users.length === 0) {
      return;
    }

    // Separate player IDs for push notifications
    const playerIds = users
      .map(user => user.oneSignalPlayerId)
      .filter(playerId => playerId);

    // Create in-app notifications for all users
    const notifications = users.map(user => ({
      user: user._id,
      type: 'new_article',
      title: 'New Article Published',
      message: `${authorUsername} published a new article: "${articleTitle}"`,
      data: {
        articleId,
        articleTitle,
        authorId: authorIdString,
        authorUsername
      },
      read: false
    }));

    // Bulk insert notifications
    const savedNotifications = await Notification.insertMany(notifications);

    // Send push notifications via OneSignal (only to users with player IDs)
    if (playerIds.length > 0) {
      await sendNewArticleNotification(
        authorIdString,
        authorUsername,
        articleTitle,
        articleId,
        playerIds
      );
    }

    // Publish notification events via RabbitMQ/Redis for real-time socket delivery
    // Each user gets their own notification event
    for (const notification of savedNotifications) {
      const notificationData = {
        userId: notification.user.toString(),
        type: 'new_article',
        title: notification.title,
        message: notification.message,
        data: notification.data,
        notificationId: notification._id.toString(),
        articleId: articleId
      };

      await eventPublisher.publishNotification(notificationData);
    }

    return {
      inAppNotifications: notifications.length,
      pushNotifications: playerIds.length
    };
  } catch (error) {
    console.error('❌ Error sending article publication notifications:', error);
    // Don't throw error - we don't want to break the article publication flow
    return null;
  }
};

module.exports = {
  notifyArticlePublished
};

