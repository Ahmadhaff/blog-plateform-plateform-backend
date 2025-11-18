const Article = require('../models/Article');
const Comment = require('../models/Comment');
const eventPublisher = require('../services/eventPublisher');
const { notifyArticlePublished } = require('../services/articleNotificationService');
const { uploadFile, deleteFile, getFileStream } = require('../config/gridfs');

const getBaseUrl = (req) => {
  // Use APP_BASE_URL if set (recommended for production)
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL.replace(/\/$/, '');
  }
  
  // Production mode - use HTTPS
  if (process.env.NODE_ENV === 'production') {
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'blog-plateform-plateform-backend.onrender.com';
    return `https://${host}`;
  }
  
  // Development mode - use HTTP localhost
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
};

const formatArticleResponse = (req, articleDoc) => {
  if (!articleDoc) {
    return null;
  }

  const article = articleDoc.toObject
    ? articleDoc.toObject({ virtuals: true })
    : { ...articleDoc };

  const baseUrl = getBaseUrl(req);
  const imageUrl = article.image?.fileId
    ? `${baseUrl}/api/articles/${article._id}/image`
    : null;

  let author = null;
  if (article.author) {
    const authorSource = article.author.toObject ? article.author.toObject() : article.author;
    // Get author ID - could be ObjectId, string, or direct value
    let authorId = authorSource._id ?? authorSource.id ?? article.author;
    
    // Convert to string if it's an ObjectId or other type
    const authorIdString = authorId?.toString ? authorId.toString() : String(authorId);
    
    // Construct full avatar URL if avatar fileId exists
    // Add timestamp for cache-busting to ensure fresh avatar is loaded
    const timestamp = Date.now();
    const avatarUrl = authorSource.avatar
      ? `${baseUrl}/api/users/${authorIdString}/avatar?t=${timestamp}`
      : null;
    
    author = {
      id: authorIdString,
      username: authorSource.username,
      avatar: avatarUrl,
      role: authorSource.role
    };
  }

  // Format likes array to strings for frontend
  const likesArray = Array.isArray(article.likes) 
    ? article.likes.map(likeId => likeId.toString ? likeId.toString() : String(likeId))
    : [];

  return {
    id: article._id ?? article.id,
    title: article.title,
    content: article.content,
    tags: Array.isArray(article.tags) ? article.tags : [],
    status: article.status,
    views: article.views ?? 0,
    likesCount: likesArray.length,
    likes: likesArray, // Include likes array so frontend can check if user liked
    commentCount: article.commentCount ?? 0,
    author,
    imageUrl,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt
  };
};

const articleController = {
  async create(req, res) {
    try {
      const {
        title,
        content,
        tags = [],
        status = 'draft'
      } = req.body;

      // Tags should already be parsed by parseFormData middleware

      if (!req.file) {
        return res.status(400).json({ error: 'Image file is required' });
      }

      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Only image files are allowed' });
      }

      let uploadedFile;
      try {
        uploadedFile = await uploadFile(req.file);
      } catch (fileError) {
        console.error('❌ Error uploading article image', fileError);
        return res.status(500).json({ error: 'Failed to store article image' });
      }

      if (!uploadedFile || !uploadedFile._id) {
        console.error('❌ GridFS upload returned invalid file metadata', uploadedFile);
        return res.status(500).json({ error: 'Failed to store article image' });
      }

      const article = new Article({
        title,
        content,
        tags,
        status,
        author: req.user._id,
        views: 0,
        likes: [],
        image: {
          fileId: uploadedFile._id,
          filename: uploadedFile.filename || req.file.originalname,
          mimetype: uploadedFile.contentType || req.file.mimetype,
          size: uploadedFile.length ?? req.file.size
        }
      });

      await article.save();
      await article.populate('author', 'username avatar');

      if (article.status === 'published') {
        await eventPublisher.publishArticleCreated(article);
        // Send notifications for newly published article
        await notifyArticlePublished(article, null);
      }

      return res.status(201).json({
        message: 'Article created successfully',
        article: formatArticleResponse(req, article)
    });
  } catch (error) {
      console.error('❌ Error creating article', error);
      return res.status(500).json({ error: 'Failed to create article' });
    }
  },

  async getAll(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
      const skip = (page - 1) * limit;

      const filter = {};

      if (!req.user) {
        filter.status = 'published';
      } else if (req.query.status) {
        filter.status = req.query.status;
      }

      if (req.query.tag) {
        filter.tags = req.query.tag;
      }

      if (req.query.author) {
        filter.author = req.query.author;
      }

      if (req.query.search) {
        filter.$text = { $search: req.query.search };
      }

      const [articles, total] = await Promise.all([
        Article.find(filter)
          .populate('author', 'username avatar')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Article.countDocuments(filter)
      ]);

      // Count ALL comments for each article (including replies, excluding deleted ones)
      // This shows total engagement: both root comments and replies
      const articlesWithCounts = await Promise.all(
        articles.map(async (article) => {
          const commentCount = await Comment.countDocuments({
            article: article._id,
            isDeleted: false
          });
          
          // Create a plain object with the commentCount
          const articleObj = article.toObject ? article.toObject({ virtuals: true }) : { ...article };
          articleObj.commentCount = commentCount;
          
          return articleObj;
        })
      );

      return res.json({
        articles: articlesWithCounts.map((doc) => formatArticleResponse(req, doc)),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1
        }
      });
    } catch (error) {
      console.error('❌ Error fetching articles', error);
      return res.status(500).json({ error: 'Failed to fetch articles' });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      
      const article = await Article.findById(id)
        .populate('author', 'username avatar email role');

      if (!article) {
        return res.status(404).json({ error: 'Article not found' });
      }

      // Count ALL comments for this article (including replies, excluding deleted ones)
      // This shows total engagement: both root comments and replies
      const commentCount = await Comment.countDocuments({
        article: article._id,
        isDeleted: false
      });

      // Create a plain object with the commentCount
      const articleObj = article.toObject ? article.toObject({ virtuals: true }) : { ...article };
      articleObj.commentCount = commentCount;

      // View incrementing is now handled via Socket.IO events
      // Authenticated users should emit 'incrementArticleView' via socket after loading the article

      return res.json({ article: formatArticleResponse(req, articleObj) });
  } catch (error) {
      console.error('❌ Error fetching article by id', error);
      return res.status(500).json({ error: 'Failed to fetch article' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const article = await Article.findById(id);

      if (!article) {
        return res.status(404).json({ error: 'Article not found' });
      }

      const {
        title,
        content,
        tags,
        status
      } = req.body;

      // Tags should already be parsed by parseFormData middleware

      // Track previous status for notification logic
      const previousStatus = article.status;

      if (typeof title !== 'undefined') article.title = title;
      if (typeof content !== 'undefined') article.content = content;
      if (typeof tags !== 'undefined') article.tags = tags;
      if (typeof status !== 'undefined') article.status = status;

      if (req.file) {
        if (!req.file.mimetype.startsWith('image/')) {
          return res.status(400).json({ error: 'Only image files are allowed' });
        }

        let uploadedFile;
        try {
          uploadedFile = await uploadFile(req.file);
        } catch (fileError) {
          console.error('❌ Error uploading article image', fileError);
          return res.status(500).json({ error: 'Failed to store article image' });
        }

        if (!uploadedFile || !uploadedFile._id) {
          console.error('❌ GridFS upload returned invalid file metadata', uploadedFile);
          return res.status(500).json({ error: 'Failed to store article image' });
        }

        if (article.image?.fileId) {
          await deleteFile(article.image.fileId);
        }

        article.image = {
          fileId: uploadedFile._id,
          filename: uploadedFile.filename,
          mimetype: uploadedFile.contentType,
          size: uploadedFile.length
        };
      }

      article.updatedAt = new Date();

      await article.save();
      await article.populate('author', 'username avatar');

      await eventPublisher.publishArticleUpdated(article);

      // Send notifications if article status changed to published
      if (previousStatus !== 'published' && article.status === 'published') {
        await notifyArticlePublished(article, previousStatus);
      }

      return res.json({
        message: 'Article updated successfully',
        article: formatArticleResponse(req, article)
      });
    } catch (error) {
      console.error('❌ Error updating article', error);
      return res.status(500).json({ error: 'Failed to update article' });
    }
  },

  async delete(req, res) {
    try {
      const { id } = req.params;

      const article = await Article.findByIdAndDelete(id);

      if (!article) {
        return res.status(404).json({ error: 'Article not found' });
      }

      await Comment.deleteMany({ article: id });
      if (article.image?.fileId) {
        await deleteFile(article.image.fileId);
      }

      return res.json({ message: 'Article and comments deleted' });
    } catch (error) {
      console.error('❌ Error deleting article', error);
      return res.status(500).json({ error: 'Failed to delete article' });
    }
  },

  async getMyArticles(req, res) {
    try {
      const authorId = req.user._id;
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
      const skip = (page - 1) * limit;
      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

      const filter = { author: authorId };
      if (req.query.status) {
        filter.status = req.query.status;
      }

      const [articles, total] = await Promise.all([
        Article.find(filter)
          .populate('author', 'username avatar')
          .sort({ [sortBy]: sortOrder })
          .skip(skip)
          .limit(limit),
        Article.countDocuments(filter)
      ]);

      // Count ALL comments for each article (including replies, excluding deleted ones)
      // This shows total engagement: both root comments and replies
      const articlesWithCounts = await Promise.all(
        articles.map(async (article) => {
          const commentCount = await Comment.countDocuments({
            article: article._id,
            isDeleted: false
          });
          
          // Create a plain object with the commentCount
          const articleObj = article.toObject ? article.toObject({ virtuals: true }) : { ...article };
          articleObj.commentCount = commentCount;
          
          return articleObj;
        })
      );

      return res.json({
        articles: articlesWithCounts.map((doc) => formatArticleResponse(req, doc)),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1
        }
      });
    } catch (error) {
      console.error('❌ Error fetching my articles', error);
      return res.status(500).json({ error: 'Failed to fetch your articles' });
    }
  },

  async getMyStats(req, res) {
    try {
      const authorId = req.user._id;
      const myArticles = await Article.find({ author: authorId });

      const totalArticles = myArticles.length;
      const publishedArticles = myArticles.filter((article) => article.status === 'published').length;
      const draftArticles = myArticles.filter((article) => article.status === 'draft').length;
      const archivedArticles = myArticles.filter((article) => article.status === 'archived').length;
      const totalViews = myArticles.reduce((sum, article) => sum + (article.views || 0), 0);
      const totalLikes = myArticles.reduce((sum, article) => sum + (article.likes?.length || 0), 0);

      const commentCounts = await Promise.all(
        myArticles.map((article) => Comment.countDocuments({ article: article._id }))
      );
      const totalComments = commentCounts.reduce((sum, count) => sum + count, 0);

      return res.json({
        stats: {
          totalArticles,
          publishedArticles,
          draftArticles,
          archivedArticles,
          totalViews,
          totalLikes,
          totalComments
        }
      });
    } catch (error) {
      console.error('❌ Error fetching my stats', error);
      return res.status(500).json({ error: 'Failed to fetch your stats' });
    }
  },

  async toggleLike(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const article = await Article.findById(id);

      if (!article) {
        return res.status(404).json({ error: 'Article not found' });
      }

      const likeIndex = article.likes.findIndex(
        (likeUserId) => likeUserId.toString() === userId.toString()
      );

      let message;
      const isLiked = likeIndex === -1; // Will be true if user is liking (not already liked)

      if (likeIndex > -1) {
        article.likes.splice(likeIndex, 1);
        message = 'Like removed';
      } else {
        article.likes.push(userId);
        message = 'Article liked';
      }

      await article.save();

      // Populate article author for notifications
      await article.populate('author', 'username avatar');

      // Send notification if article was liked (not unliked)
      if (isLiked) {
        try {
          const { notifyArticleLiked } = require('../services/articleLikeNotificationService');
          await notifyArticleLiked(article, userId, req.user.username, isLiked);
        } catch (notificationError) {
          // Log error but don't fail the request - like is already saved
          console.error('❌ Error sending article like notification:', notificationError);
        }
      }

      // Publish event AFTER saving to database
      try {
        await eventPublisher.publishArticleLiked({
          articleId: article._id.toString(),
          userId: userId.toString(),
          likes: article.likes.length,
          likesArray: article.likes.map(likeId => likeId.toString()),
          isLiked: isLiked
        });
      } catch (eventError) {
        // Log error but don't fail the request - like is already saved
        console.error('❌ Error publishing article like event:', eventError);
      }

      return res.json({
        message,
        likes: article.likes.length
      });
    } catch (error) {
      console.error('❌ Error toggling like', error);
      return res.status(500).json({ error: 'Failed to toggle like' });
    }
  },

  async changeStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['draft', 'published', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      // Get current article to check previous status
      const currentArticle = await Article.findById(id);
      if (!currentArticle) {
        return res.status(404).json({ error: 'Article not found' });
      }

      const previousStatus = currentArticle.status;

      const article = await Article.findByIdAndUpdate(
        id,
        { status, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).populate('author', 'username avatar');

      if (!article) {
        return res.status(404).json({ error: 'Article not found' });
      }
      await eventPublisher.publishArticleUpdated(article);

      // Send notifications if article status changed to published
      if (previousStatus !== 'published' && article.status === 'published') {
        await notifyArticlePublished(article, previousStatus);
      }

      return res.json({
        message: 'Article status updated',
        article: formatArticleResponse(req, article)
    });
  } catch (error) {
      console.error('❌ Error changing article status', error);
      return res.status(500).json({ error: 'Failed to change article status' });
    }
  },

  async streamImage(req, res) {
    try {
      const { id } = req.params;
      const article = await Article.findById(id).select('image');

      if (!article || !article.image?.fileId) {
        return res.status(404).json({ error: 'Image not found' });
      }

      const stream = getFileStream(article.image.fileId);

      res.set('Content-Type', article.image.mimetype || 'application/octet-stream');

      const rawFilename = article.image.filename || 'article-image';
      const safeFilename = rawFilename.replace(/[^\w.\- ]/g, '_');
      res.set('Content-Disposition', `inline; filename="${safeFilename}"`);

      stream.on('error', (error) => {
        console.error('❌ Error streaming article image', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to load image' });
        }
      });

      return stream.pipe(res);
    } catch (error) {
      console.error('❌ Error retrieving article image', error);
      return res.status(500).json({ error: 'Failed to load image' });
    }
  }
};

module.exports = articleController;
