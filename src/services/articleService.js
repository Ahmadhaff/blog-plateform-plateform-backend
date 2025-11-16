const Article = require('../models/Article');
const Comment = require('../models/Comment');
const cacheService = require('./cacheService');
const eventPublisher = require('./eventPublisher');
const { buildPagination } = require('../utils/helpers');
const { createError } = require('../utils/errors');

class ArticleService {
  async createArticle(payload) {
    const article = await Article.create(payload);
    await eventPublisher.publishArticleCreated(article);
    await cacheService.invalidateByPattern('articles:list*');
    return article;
  }

  async getArticles(req) {
    const { page, limit, skip } = buildPagination(req);
    const filters = {};

    if (req.query.status) {
      filters.status = req.query.status;
    }

    if (req.query.tag) {
      filters.tags = req.query.tag;
    }

    if (req.query.author) {
      filters.author = req.query.author;
    }

    if (req.query.search) {
      filters.$text = { $search: req.query.search };
    }

    const cacheKey = `articles:list:${JSON.stringify({ page, limit, filters })}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const [items, total] = await Promise.all([
      Article.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author', 'username role'),
      Article.countDocuments(filters)
    ]);

    const data = {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      items
    };

    await cacheService.set(cacheKey, data, 60);

    return data;
  }

  async getArticleById(articleId) {
    const article = await Article.findByIdAndUpdate(
      articleId,
      { $inc: { views: 1 } },
      { new: true }
    )
      .populate('author', 'username role')
      .populate('likes', 'username');

    if (!article) {
      throw createError('Article not found', 404);
    }

    return article;
  }

  async updateArticle(articleId, updates) {
    const article = await Article.findById(articleId);
    if (!article) {
      throw createError('Article not found', 404);
    }

    Object.assign(article, updates);
    await article.save();

    await cacheService.invalidateByPattern('articles:list*');

    return article;
  }

  async deleteArticle(articleId) {
    const article = await Article.findById(articleId);
    if (!article) {
      throw createError('Article not found', 404);
    }

    await Comment.deleteMany({ article: articleId });
    await article.deleteOne();
    await cacheService.invalidateByPattern('articles:list*');

    return { message: 'Article deleted' };
  }

  async toggleLike(articleId, userId) {
    const article = await Article.findById(articleId);
    if (!article) {
      throw createError('Article not found', 404);
    }

    const userIdStr = userId.toString();
    const likes = article.likes.map((id) => id.toString());

    if (likes.includes(userIdStr)) {
      article.likes = article.likes.filter((id) => id.toString() !== userIdStr);
    } else {
      article.likes.push(userId);
    }

    await article.save();

    return article;
  }
}

module.exports = new ArticleService();
