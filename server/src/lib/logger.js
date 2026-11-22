'use strict';

const pino = require('pino');
const config = require('../config/env');

const logger = pino({
  level: config.LOG_LEVEL,
  base: { service: 'mail-management-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.secret',
      '*.mfa_secret',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
