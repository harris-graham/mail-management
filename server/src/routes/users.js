'use strict';

const express = require('express');
const { z } = require('zod');
const { query, withTransaction } = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');
const { validate } = require('../lib/validation');
const { PERMISSIONS } = require('../lib/permissions');
const { requirePermission } = require('../middleware/auth');
const { hashPassword, validatePasswordPolicy } = require('../lib/password');
const { audit } = require('../lib/audit');
const { serializeUser } = require('../lib/serialize');
const { badRequest, notFound, conflict } = require('../lib/errors');
const { revokeAllRefreshTokens } = require('../lib/tokens');

const router = express.Router();

const userSchema = z.object({
  matricule: z.string().min(1).max(40),
  username: z.string().min(2).max(80),
  fullName: z.string().min(2).max(160),
  email: z.string().email().optional().nullable(),
  password: z.string().min(10).optional(),
  role: z.enum(['admin', 'supervisor', 'agent', 'consultation', 'archivist']),
  departmentId: z.string().uuid().optional().nullable(),
  ministryId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
});

router.get(
  '/assignable',
  requirePermission(PERMISSIONS.MAIL_READ),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.matricule, u.role, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.deleted_at IS NULL AND u.is_active
         AND u.role IN ('admin', 'supervisor', 'agent')
       ORDER BY u.full_name`
    );
    res.json({ data: rows });
  })
);

router.get(
  '/',
  requirePermission(PERMISSIONS.USER_READ),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT u.id, u.matricule, u.username, u.full_name, u.email, u.role,
              u.department_id, u.ministry_id, u.is_active, u.must_change_password,
              u.mfa_enabled, u.last_login_at, u.created_at,
              d.name AS department_name, m.name AS ministry_name
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN ministries m ON m.id = u.ministry_id
       WHERE u.deleted_at IS NULL
       ORDER BY u.full_name`
    );
    res.json({ data: rows });
  })
);

router.post(
  '/',
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate({ body: userSchema }),
  asyncHandler(async (req, res) => {
    const input = req.validated.body;
    if (!input.password) throw badRequest('A temporary password is required.');
    const policy = validatePasswordPolicy(input.password);
    if (policy) throw badRequest(policy);

    const existing = await query(
      'SELECT id FROM users WHERE matricule = $1 OR lower(username) = lower($2)',
      [input.matricule, input.username]
    );
    if (existing.rows[0]) throw conflict('Matricule or username already exists.');

    const passwordHash = await hashPassword(input.password);
    const { rows } = await query(
      `INSERT INTO users
        (matricule, username, full_name, email, password_hash, role,
         department_id, ministry_id, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
       RETURNING *`,
      [
        input.matricule,
        input.username,
        input.fullName,
        input.email || null,
        passwordHash,
        input.role,
        input.departmentId || null,
        input.ministryId || null,
        input.isActive !== false,
      ]
    );
    await audit({
      actorId: req.user.id,
      action: 'user.create',
      entity: 'user',
      entityId: rows[0].id,
      newValues: serializeUser(rows[0]),
      req,
    });
    res.status(201).json({ data: serializeUser(rows[0]) });
  })
);

const updateSchema = userSchema.partial().extend({ password: z.string().min(10).optional() });

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate({ params: z.object({ id: z.string().uuid() }), body: updateSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const input = req.validated.body;
    const { rows: existingRows } = await query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    const existing = existingRows[0];
    if (!existing) throw notFound('User not found.');

    const sets = [];
    const values = [];
    const map = {
      matricule: 'matricule',
      username: 'username',
      fullName: 'full_name',
      email: 'email',
      role: 'role',
      departmentId: 'department_id',
      ministryId: 'ministry_id',
      isActive: 'is_active',
    };
    for (const [key, column] of Object.entries(map)) {
      if (input[key] !== undefined) sets.push(`${column} = $${values.push(input[key])}`);
    }
    if (input.password) {
      const policy = validatePasswordPolicy(input.password);
      if (policy) throw badRequest(policy);
      sets.push(`password_hash = $${values.push(await hashPassword(input.password))}`);
      sets.push('must_change_password = true');
    }
    if (!sets.length) throw badRequest('No supported fields were provided.');

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${values.push(id)} RETURNING *`,
        values
      );
      if (input.isActive === false) {
        await client.query(
          'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
          [id]
        );
      }
      await audit({
        client,
        actorId: req.user.id,
        action: 'user.update',
        entity: 'user',
        entityId: id,
        oldValues: serializeUser(existing),
        newValues: serializeUser(result.rows[0]),
        req,
      });
      return result.rows[0];
    });

    res.json({ data: serializeUser(updated) });
  })
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    if (id === req.user.id) throw badRequest('You cannot delete your own account.');
    const { rows } = await query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (!rows[0]) throw notFound('User not found.');
    await query(
      'UPDATE users SET deleted_at = now(), is_active = false WHERE id = $1',
      [id]
    );
    await revokeAllRefreshTokens(id);
    await audit({
      actorId: req.user.id,
      action: 'user.delete',
      entity: 'user',
      entityId: id,
      oldValues: serializeUser(rows[0]),
      req,
    });
    res.json({ ok: true });
  })
);

const resetSchema = z.object({ temporaryPassword: z.string().min(10) });

router.post(
  '/:id/reset-password',
  requirePermission(PERMISSIONS.USER_MANAGE),
  validate({ params: z.object({ id: z.string().uuid() }), body: resetSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const { temporaryPassword } = req.validated.body;
    const policy = validatePasswordPolicy(temporaryPassword);
    if (policy) throw badRequest(policy);
    const hash = await hashPassword(temporaryPassword);
    const { rowCount } = await query(
      `UPDATE users SET password_hash = $1, must_change_password = true
       WHERE id = $2 AND deleted_at IS NULL`,
      [hash, id]
    );
    if (!rowCount) throw notFound('User not found.');
    await revokeAllRefreshTokens(id);
    await audit({
      actorId: req.user.id,
      action: 'user.reset_password',
      entity: 'user',
      entityId: id,
      req,
    });
    res.json({ ok: true });
  })
);

module.exports = router;
