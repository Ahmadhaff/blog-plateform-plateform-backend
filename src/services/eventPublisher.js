const { publishEvent } = require('../config/rabbitmq');
const { getRedisClient } = require('../config/redis');

class EventPublisher {
  async publishArticleCreated(article) {
    const eventData = {
      type: 'article.created',
      articleId: article._id,
      authorId: article.author._id || article.author,
      title: article.title
    };

    await publishEvent('article.created', eventData);

    const redis = getRedisClient();
    await redis.publish('article-events', JSON.stringify(eventData));
  }

  async publishCommentCreated(eventData) {
    const event = {
      type: 'comment.created',
      commentId: eventData.commentId,
      articleId: eventData.articleId,
      authorId: eventData.authorId,
      content: eventData.content,
      parentCommentId: eventData.parentCommentId || null,
      articleAuthorId: eventData.articleAuthorId,
      timestamp: new Date()
    };

    await publishEvent('comment.created', event);

    const redis = getRedisClient();
    await redis.publish('comment-events', JSON.stringify(event));
  }

  async publishArticleUpdated(article) {
    const eventData = {
      type: 'article.updated',
      articleId: article._id,
      authorId: article.author._id || article.author,
      title: article.title,
      status: article.status
    };

    await publishEvent('article.updated', eventData);

    const redis = getRedisClient();
    await redis.publish('article-events', JSON.stringify(eventData));
  }

  async publishNotification(notification) {
    const eventData = {
      type: notification.type || 'notification',
      ...notification
    };

    // Use routing key based on notification type
    const routingKey = eventData.type === 'notification_read' || eventData.type === 'notification_read_all'
      ? 'notification.read'
      : 'notification.new';

    await publishEvent(routingKey, eventData);

    const redis = getRedisClient();
    const redisMessage = JSON.stringify(eventData);
    await redis.publish('notification-events', redisMessage);
  }

  async publishCommentLiked(eventData) {
    const event = {
      type: 'comment.liked',
      commentId: eventData.commentId,
      articleId: eventData.articleId,
      userId: eventData.userId,
      likes: eventData.likes,
      isLiked: eventData.isLiked, // true if liked, false if unliked
      timestamp: new Date()
    };

    await publishEvent('comment.liked', event);

    const redis = getRedisClient();
    await redis.publish('comment-events', JSON.stringify(event));
  }

  async publishArticleLiked(eventData) {
    const event = {
      type: 'article.liked',
      articleId: eventData.articleId,
      userId: eventData.userId,
      likes: eventData.likes,
      likesArray: eventData.likesArray, // Full array of user IDs who liked
      isLiked: eventData.isLiked, // true if liked, false if unliked
      timestamp: new Date()
    };

    await publishEvent('article.liked', event);

    const redis = getRedisClient();
    await redis.publish('article-events', JSON.stringify(event));
  }

  async publishCommentUpdated(eventData) {
    const event = {
      type: 'comment.updated',
      commentId: eventData.commentId,
      articleId: eventData.articleId,
      content: eventData.content,
      timestamp: new Date()
    };

    await publishEvent('comment.updated', event);

    const redis = getRedisClient();
    await redis.publish('comment-events', JSON.stringify(event));
  }

  async publishCommentDeleted(eventData) {
    const event = {
      type: 'comment.deleted',
      commentId: eventData.commentId,
      articleId: eventData.articleId,
      timestamp: new Date()
    };

    await publishEvent('comment.deleted', event);

    const redis = getRedisClient();
    await redis.publish('comment-events', JSON.stringify(event));
  }
}

module.exports = new EventPublisher();
