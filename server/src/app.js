'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const swaggerUi = require('swagger-ui-express');

const config = require('./config/env');
const logger = require('./lib/logger');
const requestId = require('./middleware/requestId');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/error');
const { authenticate } = require('./middleware/auth');
const openapi = require('./openapi.json');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const referenceRoutes = require('./routes/referenceData');
const mailRoutes = require('./routes/mail');
const analyticsRoutes = require('./routes/analytics');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');

const app = express();

app.set('trust proxy', config.TRUST_PROXY);
app.disable('x-powered-by');

app.use(requestId);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customLogLevel: (req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  })
);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.CORS_ORIGINS_LIST.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
    exposedHeaders: ['x-request-id', 'content-disposition'],
  })
);

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);

// Everything below requires a valid access token.
app.use('/api/v1', apiLimiter, authenticate);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1', referenceRoutes);
app.use('/api/v1', mailRoutes);
app.use('/api/v1', analyticsRoutes);
app.use('/api/v1', notificationRoutes);
app.use('/api/v1', adminRoutes);

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// Serve the compiled SPA when it is present (single-container deployments).
const clientBuild = path.resolve(__dirname, '../../client/build');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild, { maxAge: '1d', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    return res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
