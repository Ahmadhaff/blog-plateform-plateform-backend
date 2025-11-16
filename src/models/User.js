const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  role: {
    type: String,
    enum: ['Admin', 'Éditeur', 'Rédacteur', 'Lecteur'],
    default: 'Lecteur'
  },
  verified: {
    type: Boolean,
    default: false
  },
  avatar: {
    type: String
  },
  refreshToken: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: false
  },
  passwordResetToken: {
    type: String
  },
  passwordResetExpiresAt: {
    type: Date
  },
  viewedArticles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Article'
  }],
  oneSignalPlayerId: {
    type: String,
    unique: true,
    sparse: true // Allows multiple null values
  }
}, {
  timestamps: true
});

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

userSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function toJSON() {
  const obj = this.toObject({ virtuals: true });
  delete obj.password;
  delete obj.refreshToken;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
