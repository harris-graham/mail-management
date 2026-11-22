'use strict';

const express = require('express');
const { z } = require('zod');
const asyncHandler = require('../lib/asyncHandler');
const { validate, optionalDate } = require('../lib/validation');
const { PERMISSIONS } = require('../lib/permissions');
const { requirePermission } = require('../middleware/auth');
const { exportLimiter } = require('../middleware/rateLimit');
const analytics = require('../services/analyticsService');
const { buildXlsx, buildCsv } = require('../services/reportService');

const router = express.Router();

const filterQuery = z.object({
  from: optionalDate,
  to: optionalDate,
  type: z.enum(['correspondance', 'consultation', 'def']).optional(),
  interval: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
  dimension: z
    .enum(['nature', 'ministry', 'service', 'agent', 'status', 'type'])
    .optional(),
});

router.get(
  '/analytics/summary',
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  validate({ query: filterQuery }),
  asyncHandler(async (req, res) => {
    res.json({ data: await analytics.summary(req.user, req.validated.query) });
  })
);

router.get(
  '/analytics/timeseries',
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  validate({ query: filterQuery }),
  asyncHandler(async (req, res) => {
    res.json({ data: await analytics.timeseries(req.user, req.validated.query) });
  })
);

router.get(
  '/analytics/by-dimension',
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  validate({ query: filterQuery }),
  asyncHandler(async (req, res) => {
    res.json({
      data: await analytics.byDimension(
        req.user,
        req.validated.query.dimension || 'nature',
        req.validated.query
      ),
    });
  })
);

router.get(
  '/analytics/sla',
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  validate({ query: filterQuery }),
  asyncHandler(async (req, res) => {
    res.json({ data: await analytics.sla(req.user, req.validated.query) });
  })
);

router.get(
  '/analytics/workload',
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  validate({ query: filterQuery }),
  asyncHandler(async (req, res) => {
    res.json({ data: await analytics.agentWorkload(req.user, req.validated.query) });
  })
);

router.get(
  '/analytics/export',
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  exportLimiter,
  validate({
    query: filterQuery.extend({ format: z.enum(['csv', 'xlsx']).default('xlsx') }),
  }),
  asyncHandler(async (req, res) => {
    const { format, ...filters } = req.validated.query;
    const rows = await analytics.byDimension(
      req.user,
      filters.dimension || 'nature',
      filters
    );
    const columns = [
      { header: 'Libellé', key: 'label', width: 40 },
      { header: 'Nombre', key: 'count', width: 14 },
    ];
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="statistiques.csv"');
      return res.send(buildCsv(rows, columns));
    }
    const buffer = await buildXlsx(rows, columns, 'Statistiques');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', 'attachment; filename="statistiques.xlsx"');
    return res.send(buffer);
  })
);

module.exports = router;
