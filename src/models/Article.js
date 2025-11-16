const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true
  },
  image: {
    fileId: {
      type: mongoose.Schema.Types.ObjectId
    },
    filename: {
      type: String
    },
    mimetype: {
      type: String
    },
    size: {
      type: Number
    }
  },
  tags: [{
    type: String,
    trim: true
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  views: {
    type: Number,
    default: 0
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Note: commentCount is not a virtual field anymore
// We count comments manually in controllers to:
// 1. Exclude deleted comments (isDeleted: false)
// 2. Have more control over the count
// 3. Avoid virtual population issues with .lean() queries

articleSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text'
});

articleSchema.index({ author: 1, createdAt: -1 });
articleSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Article', articleSchema);
