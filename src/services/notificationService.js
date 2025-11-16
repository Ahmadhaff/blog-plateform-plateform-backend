const { getOneSignalClient } = require('../config/onesignal');

/**
 * Send push notification to a specific user
 * @param {string} playerId - OneSignal player ID
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {object} additionalData - Additional data to send with notification
 * @returns {Promise<object>}
 */
const sendNotificationToUser = async (playerId, title, message, additionalData = {}) => {
  const client = getOneSignalClient();
  
  if (!client) {
    console.warn('⚠️  OneSignal client not available. Notification not sent.');
    return null;
  }

  if (!playerId) {
    console.warn('⚠️  No player ID provided. Notification not sent.');
    return null;
  }

  try {
    const notification = {
      contents: {
        en: message
      },
      headings: {
        en: title
      },
      include_player_ids: [playerId],
      data: additionalData,
      // Optional: Customize notification appearance
      ios_badgeType: 'Increase',
      ios_badgeCount: 1
    };

    const response = await client.createNotification(notification);
    return response;
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    throw error;
  }
};

/**
 * Send push notification to multiple users
 * @param {string[]} playerIds - Array of OneSignal player IDs
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {object} additionalData - Additional data to send with notification
 * @returns {Promise<object>}
 */
const sendNotificationToUsers = async (playerIds, title, message, additionalData = {}) => {
  const client = getOneSignalClient();
  
  if (!client) {
    console.warn('⚠️  OneSignal client not available. Notification not sent.');
    return null;
  }

  if (!playerIds || playerIds.length === 0) {
    console.warn('⚠️  No player IDs provided. Notification not sent.');
    return null;
  }

  // Filter out null/undefined player IDs
  const validPlayerIds = playerIds.filter(id => id);

  if (validPlayerIds.length === 0) {
    console.warn('⚠️  No valid player IDs provided. Notification not sent.');
    return null;
  }

  try {
    const notification = {
      contents: {
        en: message
      },
      headings: {
        en: title
      },
      include_player_ids: validPlayerIds,
      data: additionalData,
      ios_badgeType: 'Increase',
      ios_badgeCount: 1
    };

    const response = await client.createNotification(notification);
    return response;
  } catch (error) {
    console.error('❌ Error sending notifications:', error);
    throw error;
  }
};

/**
 * Send push notification to all subscribed users
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {object} additionalData - Additional data to send with notification
 * @param {object} filters - Optional filters (e.g., by tags, segments)
 * @returns {Promise<object>}
 */
const sendNotificationToAll = async (title, message, additionalData = {}, filters = []) => {
  const client = getOneSignalClient();
  
  if (!client) {
    console.warn('⚠️  OneSignal client not available. Notification not sent.');
    return null;
  }

  try {
    const notification = {
      contents: {
        en: message
      },
      headings: {
        en: title
      },
      included_segments: ['Subscribed Users'],
      data: additionalData,
      ios_badgeType: 'Increase',
      ios_badgeCount: 1
    };

    // Add filters if provided
    if (filters.length > 0) {
      notification.filters = filters;
    }

    const response = await client.createNotification(notification);
    return response;
  } catch (error) {
    console.error('❌ Error sending broadcast notification:', error);
    throw error;
  }
};

/**
 * Send notification when a new comment is added to an article
 * @param {string} articleAuthorId - ID of the article author
 * @param {string} commenterUsername - Username of the commenter
 * @param {string} articleTitle - Title of the article
 * @param {string} articleId - ID of the article
 * @param {string} playerId - OneSignal player ID of the article author
 */
const sendNewCommentNotification = async (articleAuthorId, commenterUsername, articleTitle, articleId, playerId) => {
  if (!playerId) {
    // Article author has no OneSignal player ID; skip notification
    return null;
  }

  const title = 'New Comment on Your Article';
  const message = `${commenterUsername} commented on "${articleTitle}"`;
  const additionalData = {
    type: 'new_comment',
    articleId,
    articleTitle,
    commenterUsername
  };

  return await sendNotificationToUser(playerId, title, message, additionalData);
};

/**
 * Send notification when an article is liked
 * @param {string} articleAuthorId - ID of the article author
 * @param {string} likerUsername - Username of the person who liked
 * @param {string} articleTitle - Title of the article
 * @param {string} articleId - ID of the article
 * @param {string} playerId - OneSignal player ID of the article author
 */
const sendArticleLikedNotification = async (articleAuthorId, likerUsername, articleTitle, articleId, playerId) => {
  if (!playerId) {
    // Article author has no OneSignal player ID; skip notification
    return null;
  }

  const title = 'Your Article Was Liked';
  const message = `${likerUsername} liked your article "${articleTitle}"`;
  const additionalData = {
    type: 'article_liked',
    articleId,
    articleTitle,
    likerUsername
  };

  return await sendNotificationToUser(playerId, title, message, additionalData);
};

/**
 * Send notification when a comment is replied to
 * @param {string} commentAuthorId - ID of the original comment author
 * @param {string} replierUsername - Username of the person who replied
 * @param {string} articleTitle - Title of the article
 * @param {string} articleId - ID of the article
 * @param {string} commentId - ID of the original comment
 * @param {string} playerId - OneSignal player ID of the comment author
 */
const sendCommentReplyNotification = async (commentAuthorId, replierUsername, articleTitle, articleId, commentId, playerId) => {
  if (!playerId) {
    // Comment author has no OneSignal player ID; skip notification
    return null;
  }

  const title = 'New Reply to Your Comment';
  const message = `${replierUsername} replied to your comment on "${articleTitle}"`;
  const additionalData = {
    type: 'comment_reply',
    articleId,
    articleTitle,
    commentId,
    replierUsername
  };

  return await sendNotificationToUser(playerId, title, message, additionalData);
};

/**
 * Send notification when a new article is published
 * @param {string} authorId - ID of the article author (to exclude from notifications)
 * @param {string} authorUsername - Username of the article author
 * @param {string} articleTitle - Title of the article
 * @param {string} articleId - ID of the article
 * @param {string[]} playerIds - Array of OneSignal player IDs to notify
 */
const sendNewArticleNotification = async (authorId, authorUsername, articleTitle, articleId, playerIds) => {
  if (!playerIds || playerIds.length === 0) {
    return null;
  }

  // Filter out null/undefined player IDs
  const validPlayerIds = playerIds.filter(id => id);

  if (validPlayerIds.length === 0) {
    return null;
  }

  const title = 'New Article Published';
  const message = `${authorUsername} published a new article: "${articleTitle}"`;
  const additionalData = {
    type: 'new_article',
    articleId,
    articleTitle,
    authorId,
    authorUsername
  };

  return await sendNotificationToUsers(validPlayerIds, title, message, additionalData);
};

module.exports = {
  sendNotificationToUser,
  sendNotificationToUsers,
  sendNotificationToAll,
  sendNewCommentNotification,
  sendArticleLikedNotification,
  sendCommentReplyNotification,
  sendNewArticleNotification
};

