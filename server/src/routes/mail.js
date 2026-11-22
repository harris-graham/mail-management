'use strict';

const express = require('express');
const { z } = require('zod');
const qrcode = require('qrcode');
const { query } = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');
const { validate, uuid, dateString, optionalDate, pagination } = require('../lib/validation');
const { PERMISSIONS } = require('../lib/permissions');
const { requirePermission } = require('../middleware/auth');
const { uploadLimiter, exportLimiter } = require('../middleware/rateLimit');
const { upload } = require('../middleware/upload');
const { absolutePath } = require('../lib/storage');
const { notFound, badRequest } = require('../lib/errors');
const mailService = require('../services/mailService');
const { buildMailPdf, buildXlsx, buildCsv } = require('../services/reportService');
const { sendMailRecord } = require('../services/emailService');

const router = express.Router();

const listQuery = z.object({
  ...pagination,
  type: z.enum(['correspondance', 'consultation', 'def']).optional(),
  status: z.union([z.string(), z.array(z.string())]).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  confidentiality: z.enum(['public', 'internal', 'confidential', 'secret']).optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  from: optionalDate,
  to: optionalDate,
  q: z.string().max(200).optional(),
  ministryId: uuid.optional(),
  serviceId: uuid.optional(),
  natureId: uuid.optional(),
  assignedTo: uuid.optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  archived: z.enum(['true', 'false']).optional(),
  sort: z.string().max(40).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
});

const idParams = z.object({ id: uuid });

const createSchema = z.object({
  type: z.enum(['correspondance', 'consultation', 'def']).default('correspondance'),
  subject: z.string().max(1000).optional().nullable(),
  analysis: z.string().max(10_000).optional().nullable(),
  observation: z.string().max(10_000).optional().nullable(),
  bordereau: z.string().max(500).optional().nullable(),
  projetVise: z.string().max(2000).optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  confidentiality: z.enum(['public', 'internal', 'confidential', 'secret']).default('internal'),
  ministryId: uuid.optional().nullable(),
  serviceId: uuid.optional().nullable(),
  natureId: uuid.optional().nullable(),
  departmentId: uuid.optional().nullable(),
  assignedTo: uuid.optional().nullable(),
  receivedAt: optionalDate,
  depositedAt: optionalDate,
  dueAt: z.string().datetime({ offset: true }).optional().nullable(),
  metadata: z.any().optional(),
  comment: z.string().max(2000).optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z
    .enum([
      'draft',
      'registered',
      'analyzed',
      'pending_visa',
      'visa_approved',
      'visa_rejected',
      'assigned',
      'in_progress',
      'processed',
      'archived',
      'cancelled',
    ])
    .optional(),
});

const transitionSchema = z.object({
  action: z.enum([
    'analyze',
    'submit_visa',
    'approve_visa',
    'reject_visa',
    'assign',
    'start',
    'process',
    'archive',
    'restore',
    'cancel',
    'reopen',
  ]),
  comment: z.string().max(2000).optional(),
  decidedAt: dateString.optional(),
  projetVise: z.string().max(2000).optional(),
  observation: z.string().max(10_000).optional(),
  assignedTo: uuid.optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
});

router.get(
  '/mail',
  requirePermission(PERMISSIONS.MAIL_READ),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const result = await mailService.listMail(req.user, req.validated.query);
    res.json(result);
  })
);

router.get(
  '/mail/export',
  requirePermission(PERMISSIONS.MAIL_EXPORT),
  exportLimiter,
  validate({
    query: listQuery.extend({
      format: z.enum(['csv', 'xlsx']).default('xlsx'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { format, ...filters } = req.validated.query;
    const result = await mailService.listMail(req.user, {
      ...filters,
      page: 1,
      pageSize: 10_000,
    });
    const columns = [
      { header: "No. d'ordre", key: 'reference', width: 22 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Statut', key: 'status', width: 18 },
      { header: 'Priorité', key: 'priority', width: 12 },
      { header: 'Ministère', key: 'ministry_name', width: 30 },
      { header: 'Service', key: 'service_name', width: 24 },
      { header: 'Nature', key: 'nature_name', width: 22 },
      { header: 'Objet', key: 'subject', width: 50 },
      { header: 'Date réception', key: 'received_at', width: 16 },
      { header: 'Date dépôt', key: 'deposited_at', width: 16 },
      { header: 'Échéance', key: 'due_at', width: 22 },
      { header: 'Assigné à', key: 'assigned_to_name', width: 24 },
      { header: 'Créé par', key: 'created_by_name', width: 24 },
      { header: 'Observation', key: 'observation', width: 40 },
    ];

    if (format === 'csv') {
      const csv = buildCsv(result.data, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="courriers-${new Date().toISOString().slice(0, 10)}.csv"`
      );
      return res.send(csv);
    }

    const buffer = await buildXlsx(result.data, columns, 'Courriers');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="courriers-${new Date().toISOString().slice(0, 10)}.xlsx"`
    );
    return res.send(buffer);
  })
);

router.post(
  '/mail/bulk',
  requirePermission(PERMISSIONS.MAIL_UPDATE),
  validate({
    body: z.object({
      ids: z.array(uuid).min(1).max(200),
      action: z.enum(['assign', 'archive', 'restore', 'process', 'delete', 'cancel']),
      assignedTo: uuid.optional(),
      comment: z.string().max(2000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const results = await mailService.bulkAction(
      req.validated.body.ids,
      req.validated.body.action,
      req.validated.body,
      req.user,
      req
    );
    res.json({ results });
  })
);

router.get(
  '/mail/:id',
  requirePermission(PERMISSIONS.MAIL_READ),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const record = await mailService.getMailById(req.validated.params.id, req.user);
    res.json({ data: record });
  })
);

router.post(
  '/mail',
  requirePermission(PERMISSIONS.MAIL_CREATE),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const record = await mailService.createMail(req.validated.body, req.user, req);
    res.status(201).json({ data: record });
  })
);

router.patch(
  '/mail/:id',
  requirePermission(PERMISSIONS.MAIL_UPDATE),
  validate({ params: idParams, body: updateSchema }),
  asyncHandler(async (req, res) => {
    const record = await mailService.updateMail(
      req.validated.params.id,
      req.validated.body,
      req.user,
      req
    );
    res.json({ data: record });
  })
);

router.delete(
  '/mail/:id',
  requirePermission(PERMISSIONS.MAIL_DELETE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await mailService.softDeleteMail(req.validated.params.id, req.user, req);
    res.json({ ok: true });
  })
);

router.post(
  '/mail/:id/transition',
  validate({ params: idParams, body: transitionSchema }),
  asyncHandler(async (req, res) => {
    const record = await mailService.transitionMail(
      req.validated.params.id,
      req.validated.body.action,
      req.validated.body,
      req.user,
      req
    );
    res.json({ data: record });
  })
);

router.get(
  '/mail/:id/comments',
  requirePermission(PERMISSIONS.MAIL_READ),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const comments = await mailService.listComments(req.validated.params.id, req.user);
    res.json({ data: comments });
  })
);

router.post(
  '/mail/:id/comments',
  requirePermission(PERMISSIONS.COMMENT_CREATE),
  validate({
    params: idParams,
    body: z.object({ body: z.string().min(1).max(5000) }),
  }),
  asyncHandler(async (req, res) => {
    const comment = await mailService.addComment(
      req.validated.params.id,
      req.validated.body.body,
      req.user,
      req
    );
    res.status(201).json({ data: comment });
  })
);

router.get(
  '/mail/:id/attachments',
  requirePermission(PERMISSIONS.MAIL_READ),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const record = await mailService.getMailById(req.validated.params.id, req.user);
    res.json({ data: record.attachments });
  })
);

router.post(
  '/mail/:id/attachments',
  requirePermission(PERMISSIONS.ATTACHMENT_CREATE),
  uploadLimiter,
  upload.array('files', 5),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    if (!req.files?.length) throw badRequest('At least one file is required.');
    const uploaded = [];
    for (const file of req.files) {
      uploaded.push(
        await mailService.addAttachment(req.validated.params.id, file, req.user, req)
      );
    }
    res.status(201).json({ data: uploaded });
  })
);

router.delete(
  '/attachments/:id',
  requirePermission(PERMISSIONS.ATTACHMENT_DELETE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await mailService.deleteAttachment(req.validated.params.id, req.user, req);
    res.json({ ok: true });
  })
);

router.get(
  '/attachments/:id/download',
  requirePermission(PERMISSIONS.MAIL_READ),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const attachment = await mailService.getAttachment(req.validated.params.id, req.user);
    res.download(absolutePath(attachment.storage_key), attachment.original_name);
  })
);

router.get(
  '/mail/:id/pdf',
  requirePermission(PERMISSIONS.MAIL_READ),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const record = await mailService.getMailById(req.validated.params.id, req.user);
    const buffer = await buildMailPdf(record);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${record.reference.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf"`
    );
    res.send(buffer);
  })
);

router.get(
  '/mail/:id/qr',
  requirePermission(PERMISSIONS.MAIL_READ),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const record = await mailService.getMailById(req.validated.params.id, req.user);
    const dataUrl = await qrcode.toDataURL(
      `${req.protocol}://${req.get('host')}/mail/${record.id}`
    );
    res.json({ reference: record.reference, dataUrl });
  })
);

router.post(
  '/mail/:id/send-email',
  requirePermission(PERMISSIONS.MAIL_EXPORT),
  validate({
    params: idParams,
    body: z.object({ to: z.string().email() }),
  }),
  asyncHandler(async (req, res) => {
    const record = await mailService.getMailById(req.validated.params.id, req.user);
    const pdf = await buildMailPdf(record);
    const result = await sendMailRecord(record, req.validated.body.to, pdf);
    res.json(result);
  })
);

router.post(
  '/mail/:id/watch',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const record = await mailService.getMailById(req.validated.params.id, req.user);
    await query(
      `INSERT INTO mail_watchers (record_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [record.id, req.user.id]
    );
    res.json({ ok: true });
  })
);

router.delete(
  '/mail/:id/watch',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM mail_watchers WHERE record_id = $1 AND user_id = $2', [
      req.validated.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

router.get(
  '/saved-searches',
  asyncHandler(async (req, res) => {
    res.json({ data: await mailService.listSavedSearches(req.user.id) });
  })
);

router.post(
  '/saved-searches',
  validate({ body: z.object({ name: z.string().min(1).max(120), query: z.any() }) }),
  asyncHandler(async (req, res) => {
    const saved = await mailService.saveSearch(
      req.user.id,
      req.validated.body.name,
      req.validated.body.query
    );
    res.status(201).json({ data: saved });
  })
);

router.delete(
  '/saved-searches/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const removed = await mailService.deleteSavedSearch(
      req.user.id,
      req.validated.params.id
    );
    if (!removed) throw notFound('Saved search not found.');
    res.json({ ok: true });
  })
);

module.exports = router;
