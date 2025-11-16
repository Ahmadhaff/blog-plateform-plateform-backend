const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

// All notification routes require authentication
router.use(auth);

// Register OneSignal player ID
router.post('/register', notificationController.registerPlayerId);

// Unregister OneSignal player ID
router.delete('/unregister', notificationController.unregisterPlayerId);

// Get user's OneSignal player ID
router.get('/player-id', notificationController.getPlayerId);

// Get user notifications
router.get('/', notificationController.getNotifications);

// Get unread notification count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark notification as read
router.patch('/:id/read', notificationController.markAsRead);

// Mark all notifications as read
router.patch('/mark-all-read', notificationController.markAllAsRead);

module.exports = router;

