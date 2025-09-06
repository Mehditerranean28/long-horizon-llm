const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test_db';
const NODE_ENV = process.env.NODE_ENV || 'development';
const USE_MONGO_MEMORY_SERVER = process.env.USE_MONGO_MEMORY_SERVER === 'true' || NODE_ENV === 'test';

let mongod;
let cachedDb = null;

const mongooseOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
};

async function connect() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    console.log('✅ MongoDB: Using existing database connection.');
    return cachedDb;
  }

  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB: Connection established.');
  });
  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB: Connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB: Disconnected from database.');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('🔄 MongoDB: Reconnected to database.');
  });

  let uri;
  if (USE_MONGO_MEMORY_SERVER) {
    if (!mongod) {
      console.log('🚀 MongoDB: Starting MongoMemoryServer...');
      mongod = await MongoMemoryServer.create();
    }
    uri = mongod.getUri();
    console.log(`🌐 MongoDB: Connecting to MongoMemoryServer URI: ${uri}`);
  } else {
    uri = MONGO_URI;
    console.log(`🌐 MongoDB: Connecting to external URI: ${uri.replace(/mongodb:\/\/(.*@)?/, 'mongodb://<credentials>@')}`);
  }

  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 2000;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      console.log(`Attempting MongoDB connection (attempt ${i + 1}/${MAX_RETRIES})...`);
      cachedDb = await mongoose.connect(uri, mongooseOptions);
      console.log('✅ MongoDB: Successfully connected to database.');
      return cachedDb;
    } catch (err) {
      console.error(`❌ MongoDB: Connection attempt ${i + 1} failed:`, err.message);
      if (i < MAX_RETRIES - 1) {
        const delay = RETRY_DELAY_MS * Math.pow(2, i);
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ MongoDB: All connection attempts failed. Exiting...');
        throw new Error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts: ${err.message}`);
      }
    }
  }
}

async function disconnect() {
  if (mongoose.connection.readyState === 0 || !cachedDb) {
    console.log('ℹ️ MongoDB: Already disconnected or not connected.');
    return;
  }
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB: Disconnected from database.');
  } catch (err) {
    console.error('❌ MongoDB: Error during disconnection:', err.message);
  } finally {
    if (mongod) {
      try {
        await mongod.stop();
        console.log('✅ MongoDB: MongoMemoryServer stopped.');
        mongod = null;
      } catch (err) {
        console.error('❌ MongoDB: Error stopping MongoMemoryServer:', err.message);
      }
    }
    cachedDb = null;
  }
}

function getConnection() {
  return cachedDb;
}

async function gracefulShutdown() {
  console.log('🚦 MongoDB: Initiating graceful shutdown...');
  await disconnect();
}

if (process.env.NODE_ENV !== 'test') {
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

module.exports = { connect, disconnect, getConnection };
