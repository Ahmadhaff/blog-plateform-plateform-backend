const Article = require('../models/Article');

const canCreateArticle = (req, res, next) => {
  if (!req.user || !['Rédacteur', 'Éditeur', 'Admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'You are not allowed to create articles' });
  }
  return next();
};

const canModifyArticle = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const articleId = req.params.id || req.params.articleId;
    const article = await Article.findById(articleId);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const { role, _id: userId } = req.user;
    const isAuthor = article.author && article.author.toString() === userId.toString();

    if (role === 'Admin' || role === 'Éditeur') {
      return next();
    }

    if (role === 'Rédacteur' && isAuthor) {
      return next();
    }

    return res.status(403).json({ error: 'You can only edit your own articles' });
  } catch (error) {
    return next(error);
  }
};

const canDeleteArticle = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admin can delete any article
    if (req.user.role === 'Admin') {
      return next();
    }

    // Rédacteur and Éditeur can only delete their own articles
    const articleId = req.params.id || req.params.articleId;
    const article = await Article.findById(articleId);

    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const { role, _id: userId } = req.user;
    const isAuthor = article.author && article.author.toString() === userId.toString();

    if ((role === 'Rédacteur' || role === 'Éditeur') && isAuthor) {
      return next();
    }

    return res.status(403).json({ error: 'You can only delete your own articles' });
  } catch (error) {
    return next(error);
  }
};

const canManageRoles = (req, res, next) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Only Admin can manage roles' });
  }
  return next();
};

const hasRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  return next();
};

module.exports = {
  canCreateArticle,
  canModifyArticle,
  canDeleteArticle,
  canManageRoles,
  hasRole
};
