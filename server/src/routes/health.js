'use strict';

const express = require('express');
const asyncHandler = require('../lib/asyncHandler');
const { healthCheck } = require('../db/pool');

const router = express.Router();

router.get('/live', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get(
  '/ready',
  asyncHandler(async (req, res) => {
    try {
      const database = await healthCheck();
      res.json({ status: 'ready', database });
    } catch (error) {
      res.status(503).json({ status: 'unavailable', error: error.message });
    }
  })
);

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'mail-management-api',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
