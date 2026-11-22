'use strict';

const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../lib/asyncHandler');
const { validate, uuid } = require('../lib/validation');
const { PERMISSIONS } = require('../lib/permissions');
const { requirePermission } = require('../middleware/auth');
const notifications = require('../services/notificationService');

const router = express.Router();

router.get(
  '/notifications',
  requirePermission(PERMISSIONS.NOTIFICATION_READ),
  validate({
    query: z.object({
      unread: z.enum(['true', 'false']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
  }),
  asyncHandler(async (req, res) => {
    const data = await notifications.listNotifications(req.user.id, {
      unreadOnly: req.validated.query.unread === 'true',
      limit: req.validated.query.limit,
    });
    res.json({ data, unreadCount: await notifications.unreadCount(req.user.id) });
  })
);

router.get(
  '/notifications/unread-count',
  requirePermission(PERMISSIONS.NOTIFICATION_READ),
  asyncHandler(async (req, res) => {
    res.json({ count: await notifications.unreadCount(req.user.id) });
  })
);

router.patch(
  '/notifications/:id/read',
  requirePermission(PERMISSIONS.NOTIFICATION_READ),
  validate({ params: z.object({ id: uuid }) }),
  asyncHandler(async (req, res) => {
    const notification = await notifications.markRead(req.user.id, req.validated.params.id);
    res.json({ data: notification });
  })
);

router.post(
  '/notifications/read-all',
  requirePermission(PERMISSIONS.NOTIFICATION_READ),
  asyncHandler(async (req, res) => {
    const count = await notifications.markAllRead(req.user.id);
    res.json({ updated: count });
  })
);

module.exports = router;
