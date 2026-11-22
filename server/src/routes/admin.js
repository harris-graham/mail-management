'use strict';

const express = require('express');
const { z } = require('zod');
const { promisify } = require('util');
const { execFile } = require('child_process');
const path = require('path');
const { query, healthCheck } = require('../db/pool');
const { getMigrationStatus, runMigrations } = require('../db/migrate');
const asyncHandler = require('../lib/asyncHandler');
const { validate, uuid, optionalDate } = require('../lib/validation');
const { PERMISSIONS } = require('../lib/permissions');
const { requirePermission } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { audit } = require('../lib/audit');
const { encrypt } = require('../lib/crypto');
const { hashToken, randomToken } = require('../lib/tokens');
const { syncAccount } = require('../services/emailIngest');
const { notFound, badRequest } = require('../lib/errors');
const config = require('../config/env');

const execFileAsync = promisify(execFile);
const router = express.Router();

router.get(
  '/admin/db/status',
  requirePermission(PERMISSIONS.DB_MANAGE),
  asyncHandler(async (req, res) => {
    const [health, migrations, size, tables] = await Promise.all([
      healthCheck(),
      getMigrationStatus(),
      query('SELECT pg_size_pretty(pg_database_size(current_database())) AS size'),
      query(
        `SELECT relname AS table, n_live_tup AS rows
         FROM pg_stat_user_tables
         ORDER BY n_live_tup DESC`
      ),
    ]);
    res.json({
      database: health,
      migrations,
      size: size.rows[0].size,
      tables: tables.rows,
    });
  })
);

router.post(
  '/admin/db/migrate',
  requirePermission(PERMISSIONS.DB_MANAGE),
  asyncHandler(async (req, res) => {
    const applied = await runMigrations();
    await audit({
      actorId: req.user.id,
      action: 'db.migrate',
      entity: 'database',
      newValues: { applied },
      req,
    });
    res.json({ applied });
  })
);

router.get(
  '/admin/db/backup',
  requirePermission(PERMISSIONS.DB_MANAGE),
  asyncHandler(async (req, res) => {
    const tables = [
      'departments',
      'ministries',
      'services',
      'natures',
      'users',
      'mail_records',
      'mail_events',
      'attachments',
      'comments',
      'assignments',
      'mail_watchers',
      'settings',
      'audit_log',
      'email_accounts',
      'email_messages',
      'retention_policies',
      'sequences',
    ];
    const dump = { metadata: { generatedAt: new Date().toISOString(), version: 1 }, tables: {} };
    for (const table of tables) {
      const { rows } = await query(`SELECT * FROM ${table}`);
      dump.tables[table] = rows;
    }
    await audit({
      actorId: req.user.id,
      action: 'db.backup',
      entity: 'database',
      req,
    });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="mail-management-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.send(JSON.stringify(dump, null, 2));
  })
);

router.post(
  '/admin/db/import-sqlite',
  requirePermission(PERMISSIONS.DB_MANAGE),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('A SQLite database file is required.');
    const script = path.resolve(__dirname, '../../scripts/migrate-sqlite.mjs');
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [script, req.file.path],
      {
        env: {
          ...process.env,
          SQLITE_PATH: req.file.path,
          IMPORT_ACTOR_ID: req.user.id,
        },
        maxBuffer: 20 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
      }
    );
    await audit({
      actorId: req.user.id,
      action: 'db.import_sqlite',
      entity: 'database',
      newValues: { file: req.file.originalname },
      req,
    });
    res.json({ ok: true, stdout, stderr });
  })
);

router.get(
  '/admin/audit',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate({
    query: z.object({
      actorId: uuid.optional(),
      entity: z.string().max(60).optional(),
      action: z.string().max(100).optional(),
      from: optionalDate,
      to: optionalDate,
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { actorId, entity, action, from, to, page, pageSize } = req.validated.query;
    const params = [];
    const where = [];
    if (actorId) where.push(`a.actor_id = $${params.push(actorId)}::uuid`);
    if (entity) where.push(`a.entity = $${params.push(entity)}`);
    if (action) where.push(`a.action ILIKE $${params.push(`%${action}%`)}`);
    if (from) where.push(`a.created_at >= $${params.push(from)}::date`);
    if (to) where.push(`a.created_at < ($${params.push(to)}::date + interval '1 day')`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await query(`SELECT count(*)::int AS total FROM audit_log a ${whereSql}`, params);
    const { rows } = await query(
      `SELECT a.*, u.full_name AS actor_name, u.matricule AS actor_matricule
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       ${whereSql}
       ORDER BY a.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({
      data: rows,
      pagination: { page, pageSize, total: count.rows[0].total },
    });
  })
);

router.get(
  '/admin/settings',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM settings ORDER BY key');
    res.json({ data: rows });
  })
);

router.put(
  '/admin/settings',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate({
    body: z.object({
      settings: z.array(
        z.object({ key: z.string().min(1).max(100), value: z.any() })
      ),
    }),
  }),
  asyncHandler(async (req, res) => {
    for (const setting of req.validated.body.settings) {
      await query(
        `INSERT INTO settings (key, value, updated_by)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [setting.key, JSON.stringify(setting.value), req.user.id]
      );
    }
    await audit({
      actorId: req.user.id,
      action: 'settings.update',
      entity: 'settings',
      newValues: req.validated.body.settings,
      req,
    });
    res.json({ ok: true });
  })
);

const emailAccountSchema = z.object({
  name: z.string().min(1).max(120),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(993),
  secure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
  folder: z.string().default('INBOX'),
  active: z.boolean().default(true),
});

router.get(
  '/admin/email-accounts',
  requirePermission(PERMISSIONS.EMAIL_MANAGE),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, name, host, port, secure, username, folder, active,
              last_sync_at, created_at
       FROM email_accounts ORDER BY name`
    );
    res.json({ data: rows });
  })
);

router.post(
  '/admin/email-accounts',
  requirePermission(PERMISSIONS.EMAIL_MANAGE),
  validate({ body: emailAccountSchema }),
  asyncHandler(async (req, res) => {
    const input = req.validated.body;
    const { rows } = await query(
      `INSERT INTO email_accounts
        (name, host, port, secure, username, password_encrypted, folder, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, host, port, secure, username, folder, active, created_at`,
      [
        input.name,
        input.host,
        input.port,
        input.secure,
        input.username,
        encrypt(input.password),
        input.folder,
        input.active,
      ]
    );
    res.status(201).json({ data: rows[0] });
  })
);

router.delete(
  '/admin/email-accounts/:id',
  requirePermission(PERMISSIONS.EMAIL_MANAGE),
  validate({ params: z.object({ id: uuid }) }),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM email_accounts WHERE id = $1', [req.validated.params.id]);
    res.json({ ok: true });
  })
);

router.post(
  '/admin/email-accounts/:id/sync',
  requirePermission(PERMISSIONS.EMAIL_MANAGE),
  validate({ params: z.object({ id: uuid }) }),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM email_accounts WHERE id = $1', [
      req.validated.params.id,
    ]);
    if (!rows[0]) throw notFound('Email account not found.');
    const created = await syncAccount(rows[0], req.user.id);
    res.json({ created: created.length, data: created });
  })
);

router.get(
  '/admin/system',
  requirePermission(PERMISSIONS.DB_MANAGE),
  asyncHandler(async (req, res) => {
    res.json({
      node: process.version,
      platform: process.platform,
      uptimeSeconds: Math.round(process.uptime()),
      memory: process.memoryUsage(),
      environment: config.NODE_ENV,
      scheduler: config.ENABLE_SCHEDULER,
    });
  })
);

router.post(
  '/admin/maintenance/cleanup',
  requirePermission(PERMISSIONS.DB_MANAGE),
  asyncHandler(async (req, res) => {
    const results = {};
    results.refreshTokens = (
      await query(
        "DELETE FROM refresh_tokens WHERE expires_at < now() OR revoked_at < now() - interval '30 days'"
      )
    ).rowCount;
    results.resetTokens = (
      await query('DELETE FROM password_reset_tokens WHERE expires_at < now()')
    ).rowCount;
    results.notifications = (
      await query(
        "DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < now() - interval '90 days'"
      )
    ).rowCount;
    await audit({
      actorId: req.user.id,
      action: 'maintenance.cleanup',
      entity: 'database',
      newValues: results,
      req,
    });
    res.json({ results });
  })
);

router.get(
  '/admin/webhooks',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM webhooks ORDER BY created_at DESC');
    res.json({ data: rows });
  })
);

router.post(
  '/admin/webhooks',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate({
    body: z.object({
      url: z.string().url(),
      secret: z.string().min(16),
      events: z.array(z.string()).default([]),
      active: z.boolean().default(true),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `INSERT INTO webhooks (url, secret, events, active)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [
        req.validated.body.url,
        req.validated.body.secret,
        req.validated.body.events,
        req.validated.body.active,
      ]
    );
    res.status(201).json({ data: rows[0] });
  })
);

router.delete(
  '/admin/webhooks/:id',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate({ params: z.object({ id: uuid }) }),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM webhooks WHERE id = $1', [req.validated.params.id]);
    res.json({ ok: true });
  })
);

router.get(
  '/admin/api-keys',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, name, scopes, last_used_at, expires_at, created_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ data: rows });
  })
);

router.post(
  '/admin/api-keys',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate({
    body: z.object({
      name: z.string().min(1).max(120),
      scopes: z.array(z.string()).default([]),
      expiresInDays: z.coerce.number().int().min(1).max(3650).default(365),
    }),
  }),
  asyncHandler(async (req, res) => {
    const raw = randomToken();
    const { rows } = await query(
      `INSERT INTO api_keys (user_id, name, key_hash, scopes, expires_at)
       VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)
       RETURNING id, name, scopes, expires_at, created_at`,
      [
        req.user.id,
        req.validated.body.name,
        hashToken(raw),
        req.validated.body.scopes,
        req.validated.body.expiresInDays,
      ]
    );
    res.status(201).json({ data: rows[0], key: raw });
  })
);

router.delete(
  '/admin/api-keys/:id',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  validate({ params: z.object({ id: uuid }) }),
  asyncHandler(async (req, res) => {
    await query('DELETE FROM api_keys WHERE id = $1 AND user_id = $2', [
      req.validated.params.id,
      req.user.id,
    ]);
    res.json({ ok: true });
  })
);

module.exports = router;
