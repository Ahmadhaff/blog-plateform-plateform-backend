const mongoose = require('mongoose');

const connectDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    
    // Parse the URI to extract database name for logging
    let dbName = 'default';
    try {
      // Try to extract database name from connection string
      const match = mongoUri.match(/\/([^?\/]+)(\?|$)/);
      if (match && match[1] && match[1] !== '') {
        dbName = match[1];
      }
    } catch (e) {
      // If parsing fails, use default
    }
    
    console.log(`🔗 Connecting to MongoDB...`);
    console.log(`📍 Database: ${dbName || 'default (will use default database)'}`);
    
    await mongoose.connect(mongoUri);
    
    const connectedDbName = mongoose.connection.name;
    const collections = Object.keys(mongoose.connection.collections);
    
    console.log(`✅ MongoDB Connected:`);
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Database: ${connectedDbName}`);
    console.log(`   Collections: ${collections.length} collections available`);
    if (collections.length > 0) {
      console.log(`   Collection names: ${collections.slice(0, 5).join(', ')}${collections.length > 5 ? '...' : ''}`);
    }
    
    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
};

module.exports = { connectDatabase };
