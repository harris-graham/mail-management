'use strict';

const express = require('express');
const { z } = require('zod');
const { query } = require('../db/pool');
const asyncHandler = require('../lib/asyncHandler');
const { validate } = require('../lib/validation');
const { PERMISSIONS } = require('../lib/permissions');
const { requirePermission } = require('../middleware/auth');
const { audit } = require('../lib/audit');
const { notFound, conflict, badRequest } = require('../lib/errors');

const router = express.Router();

const idParams = z.object({ id: z.string().uuid() });

// Natures ------------------------------------------------------------------

router.get(
  '/natures',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT n.*, count(m.id)::int AS usage_count
       FROM natures n
       LEFT JOIN mail_records m ON m.nature_id = n.id AND m.deleted_at IS NULL
       GROUP BY n.id
       ORDER BY n.name`
    );
    res.json({ data: rows });
  })
);

const natureSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(160),
  description: z.string().max(1000).optional().nullable(),
  active: z.boolean().optional(),
});

router.post(
  '/natures',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ body: natureSchema }),
  asyncHandler(async (req, res) => {
    const input = req.validated.body;
    const { rows } = await query(
      `INSERT INTO natures (code, name, description, active)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.code, input.name, input.description || null, input.active !== false]
    );
    await audit({
      actorId: req.user.id,
      action: 'nature.create',
      entity: 'nature',
      entityId: rows[0].id,
      newValues: rows[0],
      req,
    });
    res.status(201).json({ data: rows[0] });
  })
);

router.patch(
  '/natures/:id',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ params: idParams, body: natureSchema.partial() }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const input = req.validated.body;
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries({
      code: 'code',
      name: 'name',
      description: 'description',
      active: 'active',
    })) {
      if (input[key] !== undefined) sets.push(`${column} = $${values.push(input[key])}`);
    }
    if (!sets.length) throw badRequest('No supported fields were provided.');
    const { rows } = await query(
      `UPDATE natures SET ${sets.join(', ')} WHERE id = $${values.push(id)} RETURNING *`,
      values
    );
    if (!rows[0]) throw notFound('Nature not found.');
    await audit({
      actorId: req.user.id,
      action: 'nature.update',
      entity: 'nature',
      entityId: id,
      newValues: rows[0],
      req,
    });
    res.json({ data: rows[0] });
  })
);

router.delete(
  '/natures/:id',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const used = await query(
      'SELECT count(*)::int AS count FROM mail_records WHERE nature_id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (used.rows[0].count > 0) {
      await query('UPDATE natures SET active = false WHERE id = $1', [id]);
      return res.json({ ok: true, deactivated: true });
    }
    const { rowCount } = await query('DELETE FROM natures WHERE id = $1', [id]);
    if (!rowCount) throw notFound('Nature not found.');
    await audit({
      actorId: req.user.id,
      action: 'nature.delete',
      entity: 'nature',
      entityId: id,
      req,
    });
    res.json({ ok: true });
  })
);

// Ministries ---------------------------------------------------------------

router.get(
  '/ministries',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM ministries ORDER BY name');
    res.json({ data: rows });
  })
);

const ministrySchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
});

router.post(
  '/ministries',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ body: ministrySchema }),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'INSERT INTO ministries (code, name) VALUES ($1, $2) RETURNING *',
      [req.validated.body.code, req.validated.body.name]
    );
    await audit({
      actorId: req.user.id,
      action: 'ministry.create',
      entity: 'ministry',
      entityId: rows[0].id,
      newValues: rows[0],
      req,
    });
    res.status(201).json({ data: rows[0] });
  })
);

router.patch(
  '/ministries/:id',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ params: idParams, body: ministrySchema.partial() }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const input = req.validated.body;
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries({ code: 'code', name: 'name' })) {
      if (input[key] !== undefined) sets.push(`${column} = $${values.push(input[key])}`);
    }
    if (!sets.length) throw badRequest('No supported fields were provided.');
    const { rows } = await query(
      `UPDATE ministries SET ${sets.join(', ')} WHERE id = $${values.push(id)} RETURNING *`,
      values
    );
    if (!rows[0]) throw notFound('Ministry not found.');
    res.json({ data: rows[0] });
  })
);

router.delete(
  '/ministries/:id',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const used = await query(
      'SELECT count(*)::int AS count FROM mail_records WHERE ministry_id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (used.rows[0].count > 0) {
      throw conflict('This ministry is referenced by mail records and cannot be deleted.');
    }
    await query('DELETE FROM ministries WHERE id = $1', [id]);
    res.json({ ok: true });
  })
);

// Services -----------------------------------------------------------------

router.get(
  '/services',
  asyncHandler(async (req, res) => {
    const params = [];
    let where = '';
    if (req.query.ministryId) {
      where = `WHERE s.ministry_id = $${params.push(req.query.ministryId)}::uuid`;
    }
    const { rows } = await query(
      `SELECT s.*, m.name AS ministry_name
       FROM services s JOIN ministries m ON m.id = s.ministry_id
       ${where} ORDER BY m.name, s.name`,
      params
    );
    res.json({ data: rows });
  })
);

const serviceSchema = z.object({
  ministryId: z.string().uuid(),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
});

router.post(
  '/services',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ body: serviceSchema }),
  asyncHandler(async (req, res) => {
    const input = req.validated.body;
    const { rows } = await query(
      'INSERT INTO services (ministry_id, code, name) VALUES ($1, $2, $3) RETURNING *',
      [input.ministryId, input.code, input.name]
    );
    res.status(201).json({ data: rows[0] });
  })
);

router.patch(
  '/services/:id',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ params: idParams, body: serviceSchema.partial() }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const input = req.validated.body;
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries({
      ministryId: 'ministry_id',
      code: 'code',
      name: 'name',
    })) {
      if (input[key] !== undefined) sets.push(`${column} = $${values.push(input[key])}`);
    }
    if (!sets.length) throw badRequest('No supported fields were provided.');
    const { rows } = await query(
      `UPDATE services SET ${sets.join(', ')} WHERE id = $${values.push(id)} RETURNING *`,
      values
    );
    if (!rows[0]) throw notFound('Service not found.');
    res.json({ data: rows[0] });
  })
);

router.delete(
  '/services/:id',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const used = await query(
      'SELECT count(*)::int AS count FROM mail_records WHERE service_id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (used.rows[0].count > 0) {
      throw conflict('This service is referenced by mail records and cannot be deleted.');
    }
    await query('DELETE FROM services WHERE id = $1', [id]);
    res.json({ ok: true });
  })
);

// Departments --------------------------------------------------------------

router.get(
  '/departments',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT d.*, p.name AS parent_name,
              (SELECT count(*)::int FROM users u WHERE u.department_id = d.id AND u.deleted_at IS NULL) AS user_count
       FROM departments d
       LEFT JOIN departments p ON p.id = d.parent_id
       ORDER BY d.name`
    );
    res.json({ data: rows });
  })
);

const departmentSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().optional().nullable(),
});

router.post(
  '/departments',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ body: departmentSchema }),
  asyncHandler(async (req, res) => {
    const input = req.validated.body;
    const { rows } = await query(
      'INSERT INTO departments (code, name, parent_id) VALUES ($1, $2, $3) RETURNING *',
      [input.code, input.name, input.parentId || null]
    );
    res.status(201).json({ data: rows[0] });
  })
);

router.patch(
  '/departments/:id',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ params: idParams, body: departmentSchema.partial() }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const input = req.validated.body;
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries({
      code: 'code',
      name: 'name',
      parentId: 'parent_id',
    })) {
      if (input[key] !== undefined) sets.push(`${column} = $${values.push(input[key])}`);
    }
    if (!sets.length) throw badRequest('No supported fields were provided.');
    const { rows } = await query(
      `UPDATE departments SET ${sets.join(', ')} WHERE id = $${values.push(id)} RETURNING *`,
      values
    );
    if (!rows[0]) throw notFound('Department not found.');
    res.json({ data: rows[0] });
  })
);

router.delete(
  '/departments/:id',
  requirePermission(PERMISSIONS.REFERENCE_MANAGE),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const used = await query(
      'SELECT count(*)::int AS count FROM mail_records WHERE department_id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (used.rows[0].count > 0) {
      throw conflict('This department is referenced by mail records and cannot be deleted.');
    }
    await query('DELETE FROM departments WHERE id = $1', [id]);
    res.json({ ok: true });
  })
);

router.get(
  '/reference-data',
  asyncHandler(async (req, res) => {
    const [natures, ministries, services, departments] = await Promise.all([
      query('SELECT * FROM natures WHERE active ORDER BY name'),
      query('SELECT * FROM ministries ORDER BY name'),
      query('SELECT * FROM services ORDER BY name'),
      query('SELECT * FROM departments ORDER BY name'),
    ]);
    res.json({
      natures: natures.rows,
      ministries: ministries.rows,
      services: services.rows,
      departments: departments.rows,
    });
  })
);

module.exports = router;
