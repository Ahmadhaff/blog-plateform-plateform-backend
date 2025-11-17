const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const { connectRedis } = require('./config/redis');
const { connectRabbitMQ } = require('./config/rabbitmq');
const { initializeOneSignal } = require('./config/onesignal');
// const { apiLimiter } = require('./middleware/rateLimiter');
const articleRoutes = require('./routes/article.routes');

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
const defaultOrigins = [
  'http://localhost:4200', // Main frontend (Angular)
  'http://localhost:4201', // Admin panel frontend (Angular)
  'https://blogplateform.netlify.app' // Production frontend
];
const envOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.CLIENT_URLS ? process.env.CLIENT_URLS.split(',') : [])
].filter(Boolean);
const allowedOrigins = [...new Set([...envOrigins, ...defaultOrigins])];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.log(`❌ CORS: Blocked origin: ${origin}`);
    console.log(`✅ Allowed origins:`, allowedOrigins);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiter commented out for now
// app.use('/api/', apiLimiter);

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/articles', articleRoutes);
app.use('/api/comments', require('./routes/comment.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'platform-server',
    timestamp: new Date()
  });
});

// Global error handler - must be before 404 handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  const status = err.statusCode || err.status || 500;
  
  // Ensure CORS headers are set even on errors
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  }
  
  // Don't send error details in production
  const errorMessage = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message || 'Internal server error';
  
  res.status(status).json({ error: errorMessage });
});

// 404 handler
app.use((req, res) => {
  // Set CORS headers for 404 as well
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.status(404).json({ error: 'Route not found' });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  // Don't exit in production, let the server continue
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // Don't exit in production, let the server continue
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');

    // Don't fail server startup if Redis/RabbitMQ fail
    try {
      await connectRedis();
    } catch (redisError) {
      console.error('⚠️ Redis connection failed, continuing without Redis:', redisError.message);
    }

    try {
      await connectRabbitMQ();
    } catch (rabbitError) {
      console.error('⚠️ RabbitMQ connection failed, continuing without RabbitMQ:', rabbitError.message);
    }

    // Initialize OneSignal (non-blocking)
    try {
      initializeOneSignal();
    } catch (onesignalError) {
      console.error('⚠️ OneSignal initialization failed:', onesignalError.message);
    }

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Platform Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
