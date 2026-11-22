'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const { tooManyRequests } = require('../lib/errors');

const skip = () => config.NODE_ENV === 'test';

const common = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  handler: (req, res, next) => next(tooManyRequests()),
};

const apiLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 900,
});

const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 12,
  skipSuccessfulRequests: true,
});

const uploadLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 120,
});

const exportLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  limit: 60,
});

module.exports = { apiLimiter, loginLimiter, uploadLimiter, exportLimiter };
