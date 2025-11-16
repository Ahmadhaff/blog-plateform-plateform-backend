const User = require('../models/User');
const Notification = require('../models/Notification');
const { sendNotificationToUsers } = require('../services/notificationService');
const eventPublisher = require('../services/eventPublisher');

/**
 * Register or update OneSignal player ID for a user
 * POST /api/notifications/register
 */
const registerPlayerId = async (req, res) => {
  try {
    const { playerId } = req.body;
    const userId = req.user._id;

    if (!playerId) {
      return res.status(400).json({ error: 'Player ID is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update or set the player ID
    // If another user has this player ID, remove it from them first
    await User.updateOne(
      { oneSignalPlayerId: playerId, _id: { $ne: userId } },
      { $unset: { oneSignalPlayerId: 1 } }
    );

    user.oneSignalPlayerId = playerId;
    await user.save();

    return res.json({
      message: 'Player ID registered successfully',
      playerId: user.oneSignalPlayerId
    });
  } catch (error) {
    console.error('❌ Error registering player ID:', error);
    return res.status(500).json({ error: 'Failed to register player ID' });
  }
};

/**
 * Remove OneSignal player ID for a user
 * DELETE /api/notifications/unregister
 */
const unregisterPlayerId = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.oneSignalPlayerId = undefined;
    await user.save();

    return res.json({ message: 'Player ID unregistered successfully' });
  } catch (error) {
    console.error('❌ Error unregistering player ID:', error);
    return res.status(500).json({ error: 'Failed to unregister player ID' });
  }
};

/**
 * Get user's OneSignal player ID
 * GET /api/notifications/player-id
 */
const getPlayerId = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select('oneSignalPlayerId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      playerId: user.oneSignalPlayerId || null
    });
  } catch (error) {
    console.error('❌ Error getting player ID:', error);
    return res.status(500).json({ error: 'Failed to get player ID' });
  }
};

/**
 * Get user notifications
 * GET /api/notifications
 */
const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    const unreadOnly = req.query.unread === 'true';

    const filter = { user: userId };
    if (unreadOnly) {
      filter.read = false;
    }

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments(filter)
    ]);

    return res.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1
      }
    });
  } catch (error) {
    console.error('❌ Error getting notifications:', error);
    return res.status(500).json({ error: 'Failed to get notifications' });
  }
};

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;

    const count = await Notification.countDocuments({
      user: userId,
      read: false
    });

    return res.json({ count });
  } catch (error) {
    console.error('❌ Error getting unread count:', error);
    return res.status(500).json({ error: 'Failed to get unread count' });
  }
};

/**
 * Mark notification as read
 * PATCH /api/notifications/:id/read
 */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOne({
      _id: id,
      user: userId
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Only mark as read if not already read
    if (!notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      await notification.save();

      // Publish event for real-time count update via socket
      const unreadCount = await Notification.countDocuments({
        user: userId,
        read: false
      });

      await eventPublisher.publishNotification({
        userId: userId.toString(),
        type: 'notification_read',
        notificationId: id,
        unreadCount,
        articleId: notification.data?.articleId || null
      });
    }

    // Return notification data including article ID for navigation
    const response = {
      message: 'Notification marked as read',
      notification: notification.toObject()
    };

    // If it's a new_article notification, include articleId for easy navigation
    if (notification.type === 'new_article' && notification.data?.articleId) {
      response.articleId = notification.data.articleId;
    }

    return res.json(response);
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

/**
 * Mark all notifications as read
 * PATCH /api/notifications/mark-all-read
 */
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

      await Notification.updateMany(
        { user: userId, read: false },
        {
          $set: {
            read: true,
            readAt: new Date()
          }
        }
      );

      // Publish event for real-time count update via socket
      const unreadCount = 0; // All marked as read
      await eventPublisher.publishNotification({
        userId: userId.toString(),
        type: 'notification_read_all',
        unreadCount
      });

      return res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    return res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};

module.exports = {
  registerPlayerId,
  unregisterPlayerId,
  getPlayerId,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
