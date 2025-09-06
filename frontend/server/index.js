"use strict";

// Created by MEHDI HMIDI

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL ENVIRONMENT CONFIGURATION AND VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
// Centralised environment configuration with validation.
const {
  NODE_ENV,
  PORT,
  MONGODB_URI,
  SESSION_SECRET,
  STRIPE_SECRET_KEY,
  STRIPE_PRICE_ID,
  STRIPE_WEBHOOK_SECRET,
  BACKEND_HTTP_URL,
  WS_URL,
} = require("../config/env");

const IS_PRODUCTION_ENV = NODE_ENV === 'production';
const IS_DEVELOPMENT_ENV = NODE_ENV === 'development';
// Removed IS_TEST_ENV as it was unused and unneeded for this file's logic.

// ─────────────────────────────────────────────────────────────────────────────
// CORE IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
require('express-async-errors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const session = require('express-session');
const compression = require('compression');
const cors = require('cors');
const expressPino = require('express-pino-logger');
const logger = require('./utils/logger');
const Stripe = require('stripe');
const { promClient, metricsRegistry } = require('./utils/metrics');
const createApiRoutes = require('./routes');
const applyCorrelationIdMiddleware = require('./middleware/correlationId');
const requestContext = require('./utils/requestContext');
const { WebSocketServer, WebSocket } = require('ws');
const next = require('next');

// ─────────────────────────────────────────────────────────────────────────────
// ROBUST LOGGING INFRASTRUCTURE
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// OBSERVABILITY: PROMETHEUS METRICS
// ─────────────────────────────────────────────────────────────────────────────
const httpRequestDurationSeconds = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.003, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE CONNECTION MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      autoIndex: IS_DEVELOPMENT_ENV,
      autoCreate: IS_DEVELOPMENT_ENV,
    });
    logger.info('MongoDB connection established successfully.');
  } catch (err) {
    logger.fatal({ err, message: err.message }, 'FATAL: Failed to establish MongoDB connection. Terminating application.');
    process.exit(1);
  }
})();

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE API CLIENT INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────
const stripeClient = Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2022-11-15', // Confirmed as current, as of June 12, 2025.
  typescript: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// NEXT.JS APPLICATION SETUP
// ─────────────────────────────────────────────────────────────────────────────
const nextApp = next({
  dev: !IS_PRODUCTION_ENV,
  conf: {
    distDir: './.next',
    compress: false,
  },
});

const nextRequestHandler = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const app = express();

  // ───────────────────────────────────────────────────────────────────────────
  // GLOBAL APPLICATION MIDDLEWARE
  // ───────────────────────────────────────────────────────────────────────────
  app.disable('x-powered-by');
  app.use(expressPino({ logger }));
  app.use(requestContext.contextMiddleware);
  app.use(helmet({
    contentSecurityPolicy: IS_PRODUCTION_ENV ? undefined : false,
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  }));
  app.use(cors({
    origin: IS_PRODUCTION_ENV ? BACKEND_HTTP_URL : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
  }));
  app.use(compression({
    level: 6,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
  }));
  app.use(applyCorrelationIdMiddleware);
  app.use((req, res, next) => {
    const requestTimer = httpRequestDurationSeconds.startTimer();
    res.on('finish', () => {
      const routePath = req.route ? req.route.path : req.path;
      requestTimer({
        method: req.method,
        route: routePath,
        status_code: res.statusCode,
      });
    });
    next();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // RATE LIMITING
  // ───────────────────────────────────────────────────────────────────────────
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn({ ip: req.ip, method: req.method, path: req.originalUrl }, 'Rate limit exceeded for IP.');
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
    },
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // JSON BODY PARSER
  // ───────────────────────────────────────────────────────────────────────────
  app.use(express.json({
    limit: '500kb',
    strict: true,
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // PERSISTENT SESSION MANAGEMENT
  // ───────────────────────────────────────────────────────────────────────────
  app.use(session({
    store: MongoStore.create({
      mongoUrl: MONGODB_URI,
      ttl: 14 * 24 * 3600,
      autoRemove: 'interval',
      autoRemoveInterval: 60,
      touchAfter: 24 * 3600,
      collectionName: 'sessions',
    }),
    secret: SESSION_SECRET,
    name: 'sovereign.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: IS_PRODUCTION_ENV,
      sameSite: 'Lax',
      maxAge: 14 * 24 * 3600 * 1000,
    },
  }));

  // ───────────────────────────────────────────────────────────────────────────
  // METRICS ENDPOINT
  // ───────────────────────────────────────────────────────────────────────────
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metricsRegistry.contentType);
    try {
      const metrics = await metricsRegistry.metrics();
      res.send(metrics);
    } catch (err) {
      logger.error({ err }, 'Failed to retrieve Prometheus metrics.');
      res.status(500).send('Error retrieving metrics.');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // API ROUTES
  // ───────────────────────────────────────────────────────────────────────────
  app.use('/api', createApiRoutes(stripeClient, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET));

  // ───────────────────────────────────────────────────────────────────────────
  // GLOBAL ERROR HANDLER
  // ───────────────────────────────────────────────────────────────────────────
  app.use((err, req, res, next) => {
    logger.error({
      err,
      correlationId: req.correlationId,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      user: req.user ? req.user.id : 'anonymous',
    }, 'Unhandled application error caught by global error handler.');

    const statusCode = err.statusCode || 500;
    const errorMessage = IS_PRODUCTION_ENV ? 'Internal server error' : err.message;

    res.status(statusCode).json({
      error: errorMessage,
      ...(IS_DEVELOPMENT_ENV && { stack: err.stack }),
      correlationId: req.correlationId,
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // NEXT.JS CATCH-ALL HANDLER
  // ───────────────────────────────────────────────────────────────────────────
  app.all('*', (req, res) => nextRequestHandler(req, res));

  // ───────────────────────────────────────────────────────────────────────────
  // HTTP & WEBSOCKET SERVER INITIALIZATION
  // ───────────────────────────────────────────────────────────────────────────
  const httpServer = app.listen(PORT, () => {
    logger.info(`HTTP Server is operational on http://localhost:${PORT} [${NODE_ENV} environment]`);
  });

  const browserWsClients = new Set();
  let backendWsConnection;
  const WS_RETRY_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
  const wsConnectStart = Date.now();

  const connectToBackendWebSocket = (attempt = 1) => {
    backendWsConnection = new WebSocket(WS_URL);

    backendWsConnection
      .on('open', () => {
        logger.info(`Successfully connected to backend WebSocket at ${WS_URL}.`);
      })
      .on('message', (messageData) => {
        for (const wsClient of browserWsClients) {
          if (wsClient.readyState === WebSocket.OPEN) {
            wsClient.send(messageData);
          } else {
            browserWsClients.delete(wsClient);
            logger.debug('Removed disconnected browser WebSocket client.');
          }
        }
      })
      .on('close', (code, reason) => {
        logger.warn(`Backend WebSocket closed. Code: ${code}, Reason: ${reason}. Attempting reconnect.`);
        const elapsed = Date.now() - wsConnectStart;
        if (elapsed > WS_RETRY_WINDOW_MS) {
          logger.fatal('Could not reconnect to backend WebSocket within allowed window. Exiting.');
          process.exit(1);
        }
        const retryDelayMs = Math.min(5000 * Math.pow(2, attempt - 1), 60000);
        logger.info(`Retrying backend WebSocket connection in ${retryDelayMs / 1000} seconds (Attempt ${attempt}).`);
        setTimeout(() => connectToBackendWebSocket(attempt + 1), retryDelayMs);
      })
      .on('error', (err) => {
        logger.error({ err, message: err.message }, 'Backend WebSocket error encountered. Connection will attempt to self-heal.');
      });
  };
  connectToBackendWebSocket();

  const browserWsServer = new WebSocketServer({ server: httpServer, path: '/api/notifications' });
  browserWsServer.on('connection', (ws) => {
    browserWsClients.add(ws);
    logger.info(`New browser WebSocket client connected. Total clients: ${browserWsClients.size}`);

    ws.on('message', (data) => {
      if (backendWsConnection && backendWsConnection.readyState === WebSocket.OPEN) {
        backendWsConnection.send(data);
      }
    });

    ws.on('close', (code, reason) => {
      browserWsClients.delete(ws);
      logger.info(`Browser WebSocket client disconnected. Code: ${code}, Reason: ${reason}. Remaining clients: ${browserWsClients.size}`);
    });

    ws.on('error', (err) => {
      logger.error({ err }, 'Browser WebSocket client error.');
      browserWsClients.delete(ws);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GRACEFUL SHUTDOWN PROCEDURE
  // ───────────────────────────────────────────────────────────────────────────
  const initiateGracefulShutdown = async () => {
    logger.info('Commencing graceful shutdown sequence...');

    if (browserWsServer) {
      logger.info('Closing browser WebSocket server...');
      browserWsServer.clients.forEach(ws => ws.close(1001, 'Server shutting down'));
      browserWsServer.close(() => logger.info('Browser WebSocket server closed.'));
    }
    if (backendWsConnection && backendWsConnection.readyState === WebSocket.OPEN) {
      logger.info('Closing backend WebSocket connection...');
      backendWsConnection.close(1001, 'Server shutting down');
    }

    const HTTP_SERVER_SHUTDOWN_TIMEOUT_MS = 15000;
    logger.info(`Closing HTTP server (allowing up to ${HTTP_SERVER_SHUTDOWN_TIMEOUT_MS / 1000}s for active requests)...`);
    httpServer.close((err) => {
      if (err) {
        logger.error({ err }, 'Error during HTTP server close.');
      } else {
        logger.info('HTTP server closed successfully.');
      }
    });

    const shutdownTimeout = setTimeout(() => {
      logger.fatal('Forcing application shutdown after timeout. Some connections may not have closed gracefully.');
      process.exit(1);
    }, HTTP_SERVER_SHUTDOWN_TIMEOUT_MS + 5000);

    logger.info('Disconnecting from MongoDB...');
    try {
      await mongoose.disconnect();
      logger.info('MongoDB disconnected.');
    } catch (err) {
      logger.error({ err }, 'Error during MongoDB disconnection.');
    }

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown completed. Exiting.');
    process.exit(0);
  };

  process.on('SIGINT', initiateGracefulShutdown);
  process.on('SIGTERM', initiateGracefulShutdown);

  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal({ reason, promise }, 'UNHANDLED PROMISE REJECTION! Application state is compromised. Forcing exit.');
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'UNCAUGHT EXCEPTION! This is a serious bug. Application state is corrupted. Forcing exit.');
    process.exit(1);
  });

}).catch((err) => {
  logger.fatal({ err }, 'FATAL: Next.js application preparation failed. Terminating process.');
  process.exit(1);
});