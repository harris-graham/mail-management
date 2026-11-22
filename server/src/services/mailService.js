'use strict';

const { query, withTransaction } = require('../db/pool');
const { nextReference } = require('../lib/reference');
const { audit } = require('../lib/audit');
const { notFound, forbidden, badRequest } = require('../lib/errors');
const { applyTransition } = require('./workflow');
const { notifyUsers, notifyStakeholders } = require('./notificationService');
const { processAttachment } = require('./ocrService');
const { checksum } = require('../lib/storage');

const MAIL_SELECT = `
  SELECT m.id, m.reference, m.type, m.status, m.priority, m.confidentiality,
         m.subject, m.analysis, m.observation, m.bordereau, m.projet_vise,
         m.ministry_id, m.service_id, m.nature_id, m.department_id,
         m.assigned_to, m.created_by, m.received_at, m.deposited_at,
         m.decided_at, m.due_at, m.closed_at, m.archived_at,
         m.legacy_key, m.legacy_id, m.legacy_archive_id, m.metadata,
         m.created_at, m.updated_at, m.deleted_at,
         n.name AS nature_name, n.code AS nature_code,
         mi.name AS ministry_name, sv.name AS service_name,
         d.name AS department_name,
         cu.full_name AS created_by_name, cu.matricule AS created_by_matricule,
         au.full_name AS assigned_to_name, au.matricule AS assigned_to_matricule,
         (SELECT count(*)::int FROM attachments a
           WHERE a.record_id = m.id AND a.deleted_at IS NULL) AS attachment_count,
         (SELECT count(*)::int FROM comments c
           WHERE c.record_id = m.id AND c.deleted_at IS NULL) AS comment_count
  FROM mail_records m
  LEFT JOIN natures n ON n.id = m.nature_id
  LEFT JOIN ministries mi ON mi.id = m.ministry_id
  LEFT JOIN services sv ON sv.id = m.service_id
  LEFT JOIN departments d ON d.id = m.department_id
  LEFT JOIN users cu ON cu.id = m.created_by
  LEFT JOIN users au ON au.id = m.assigned_to
`;

const SORTABLE = {
  reference: 'm.reference',
  received_at: 'm.received_at',
  deposited_at: 'm.deposited_at',
  due_at: 'm.due_at',
  created_at: 'm.created_at',
  updated_at: 'm.updated_at',
  priority: 'm.priority',
  status: 'm.status',
  type: 'm.type',
};

function accessClause(user, params, alias = 'm') {
  const clauses = [];
  if (user.role === 'admin') return clauses;

  if (user.role !== 'consultation') {
    const userIndex = params.push(user.id);
    const parts = [
      `${alias}.created_by = $${userIndex}`,
      `${alias}.assigned_to = $${userIndex}`,
    ];
    if (user.department_id) {
      parts.push(`${alias}.department_id = $${params.push(user.department_id)}`);
    }
    clauses.push(`(${parts.join(' OR ')})`);
  }

  const secretIndex = params.push(user.id);
  clauses.push(
    `(${alias}.confidentiality <> 'secret' OR ${alias}.created_by = $${secretIndex} OR ${alias}.assigned_to = $${secretIndex})`
  );
  return clauses;
}

function assertRecordAccess(record, user) {
  if (!record) throw notFound('Mail record not found.');
  if (user.role === 'admin') return;
  if (
    record.confidentiality === 'secret' &&
    record.created_by !== user.id &&
    record.assigned_to !== user.id
  ) {
    throw forbidden('This confidential record is not shared with you.');
  }
  if (user.role === 'consultation') return;
  if (record.created_by === user.id || record.assigned_to === user.id) return;
  if (user.department_id && record.department_id === user.department_id) return;
  throw forbidden('You do not have access to this record.');
}

function computeDueAt(priority, receivedAt) {
  const hours = { low: 120, normal: 72, high: 24, urgent: 8 }[priority] || 72;
  const base = receivedAt ? new Date(receivedAt) : new Date();
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function buildFilters(user, filters = {}) {
  const params = [];
  const where = ['m.deleted_at IS NULL'];

  if (filters.type) {
    where.push(`m.type = $${params.push(filters.type)}::mail_type`);
  }
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    where.push(`m.status = ANY($${params.push(statuses)}::mail_status[])`);
  }
  if (filters.priority) {
    where.push(`m.priority = $${params.push(filters.priority)}::priority`);
  }
  if (filters.confidentiality) {
    where.push(`m.confidentiality = $${params.push(filters.confidentiality)}::confidentiality`);
  }
  if (filters.year) {
    where.push(
      `EXTRACT(YEAR FROM COALESCE(m.received_at, m.created_at::date)) = $${params.push(filters.year)}`
    );
  }
  if (filters.from) {
    where.push(`COALESCE(m.received_at, m.created_at::date) >= $${params.push(filters.from)}::date`);
  }
  if (filters.to) {
    where.push(`COALESCE(m.received_at, m.created_at::date) <= $${params.push(filters.to)}::date`);
  }
  if (filters.ministryId) {
    where.push(`m.ministry_id = $${params.push(filters.ministryId)}::uuid`);
  }
  if (filters.serviceId) {
    where.push(`m.service_id = $${params.push(filters.serviceId)}::uuid`);
  }
  if (filters.natureId) {
    where.push(`m.nature_id = $${params.push(filters.natureId)}::uuid`);
  }
  if (filters.assignedTo) {
    where.push(`m.assigned_to = $${params.push(filters.assignedTo)}::uuid`);
  }
  if (filters.unassigned === 'true' || filters.unassigned === true) {
    where.push('m.assigned_to IS NULL');
  }
  if (filters.overdue === 'true' || filters.overdue === true) {
    where.push(
      "m.due_at < now() AND m.status NOT IN ('processed', 'archived', 'cancelled')"
    );
  }
  if (filters.archived === 'true' || filters.archived === true) {
    where.push("m.status = 'archived'");
  } else if (filters.archived === 'false' || filters.archived === false) {
    where.push("m.status <> 'archived'");
  }
  if (filters.q) {
    const textIndex = params.push(filters.q);
    const likeIndex = params.push(`%${filters.q}%`);
    where.push(
      `(m.search_vector @@ plainto_tsquery('french', $${textIndex}) OR m.reference ILIKE $${likeIndex} OR m.subject ILIKE $${likeIndex})`
    );
  }

  where.push(...accessClause(user, params));
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

async function listMail(user, filters = {}) {
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 25, 1), 200);
  const sort = SORTABLE[filters.sort] || 'm.received_at';
  const direction = String(filters.direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const { whereSql, params } = buildFilters(user, filters);

  const count = await query(
    `SELECT count(*)::int AS total FROM mail_records m ${whereSql}`,
    params
  );
  const rows = await query(
    `${MAIL_SELECT} ${whereSql}
     ORDER BY ${sort} ${direction} NULLS LAST, m.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, pageSize, (page - 1) * pageSize]
  );

  const total = count.rows[0].total;
  return {
    data: rows.rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

async function getMailById(id, user) {
  const { rows } = await query(
    `${MAIL_SELECT} WHERE m.id = $1 AND m.deleted_at IS NULL`,
    [id]
  );
  const record = rows[0];
  if (!record) throw notFound('Mail record not found.');
  assertRecordAccess(record, user);

  const [events, attachments, comments, assignments] = await Promise.all([
    query(
      `SELECT e.*, u.full_name AS actor_name, u.matricule AS actor_matricule
       FROM mail_events e
       LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.record_id = $1
       ORDER BY e.created_at ASC`,
      [id]
    ),
    query(
      `SELECT a.id, a.record_id, a.filename, a.original_name, a.mime_type,
              a.size_bytes, a.sha256, a.ocr_status, a.created_at,
              u.full_name AS uploaded_by_name
       FROM attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.record_id = $1 AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC`,
      [id]
    ),
    query(
      `SELECT c.*, u.full_name AS author_name, u.matricule AS author_matricule
       FROM comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.record_id = $1 AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC`,
      [id]
    ),
    query(
      `SELECT a.*, u.full_name AS assigned_to_name
       FROM assignments a
       LEFT JOIN users u ON u.id = a.assigned_to
       WHERE a.record_id = $1
       ORDER BY a.created_at DESC`,
      [id]
    ),
  ]);

  return {
    ...record,
    events: events.rows,
    attachments: attachments.rows,
    comments: comments.rows,
    assignments: assignments.rows,
  };
}

async function createMail(input, user, req) {
  const type = input.type || 'correspondance';
  const receivedAt = input.receivedAt || new Date().toISOString().slice(0, 10);
  const priority = input.priority || 'normal';
  const dueAt = input.dueAt || computeDueAt(priority, receivedAt);
  const subject = input.subject || input.analysis || null;
  const analysis = input.analysis || input.subject || null;

  const created = await withTransaction(async (client) => {
    const reference = await nextReference(client, type, new Date(receivedAt));
    const { rows } = await client.query(
      `INSERT INTO mail_records
        (reference, type, status, priority, confidentiality, subject, analysis,
         observation, bordereau, projet_vise, ministry_id, service_id, nature_id,
         department_id, assigned_to, created_by, received_at, deposited_at,
         due_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [
        reference,
        type,
        input.status || 'registered',
        priority,
        input.confidentiality || 'internal',
        subject,
        analysis,
        input.observation || null,
        input.bordereau || null,
        input.projetVise || null,
        input.ministryId || null,
        input.serviceId || null,
        input.natureId || null,
        input.departmentId || user.department_id || null,
        input.assignedTo || null,
        user.id,
        receivedAt,
        input.depositedAt || receivedAt,
        dueAt,
        JSON.stringify(input.metadata || {}),
      ]
    );
    const record = rows[0];
    await client.query(
      `INSERT INTO mail_events (record_id, event_type, to_status, actor_id, comment)
       VALUES ($1, 'created', $2, $3, $4)`,
      [record.id, record.status, user.id, input.comment || null]
    );
    await audit({
      client,
      actorId: user.id,
      action: 'mail.create',
      entity: 'mail_record',
      entityId: record.id,
      newValues: record,
      req,
    });
    if (record.assigned_to) {
      await client.query(
        `INSERT INTO assignments (record_id, assigned_to, assigned_by, note)
         VALUES ($1, $2, $3, $4)`,
        [record.id, record.assigned_to, user.id, input.comment || null]
      );
    }
    return record;
  });

  if (created.assigned_to) {
    await notifyUsers(
      [created.assigned_to],
      {
        recordId: created.id,
        type: 'assignment',
        title: `Nouveau courrier : ${created.reference}`,
        body: created.subject,
      }
    );
  }

  const supervisors = await query(
    `SELECT id FROM users
     WHERE role IN ('supervisor', 'admin') AND is_active AND deleted_at IS NULL
       AND ($1::uuid IS NULL OR department_id = $1)`,
    [created.department_id]
  );
  await notifyUsers(
    supervisors.rows.map((row) => row.id),
    {
      recordId: created.id,
      type: 'info',
      title: `Nouveau courrier enregistré : ${created.reference}`,
      body: created.subject,
    }
  );

  return getMailById(created.id, user);
}

async function updateMail(id, input, user, req) {
  const { rows: existingRows } = await query(
    'SELECT * FROM mail_records WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  const existing = existingRows[0];
  if (!existing) throw notFound('Mail record not found.');
  assertRecordAccess(existing, user);

  const fieldMap = {
    subject: 'subject',
    analysis: 'analysis',
    observation: 'observation',
    bordereau: 'bordereau',
    projetVise: 'projet_vise',
    priority: 'priority',
    confidentiality: 'confidentiality',
    ministryId: 'ministry_id',
    serviceId: 'service_id',
    natureId: 'nature_id',
    departmentId: 'department_id',
    assignedTo: 'assigned_to',
    receivedAt: 'received_at',
    depositedAt: 'deposited_at',
    dueAt: 'due_at',
    status: 'status',
  };

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (input[key] !== undefined) {
      sets.push(`${column} = $${values.push(input[key])}`);
    }
  }
  if (input.metadata !== undefined) {
    sets.push(`metadata = $${values.push(JSON.stringify(input.metadata))}::jsonb`);
  }
  if (!sets.length) throw badRequest('No supported fields were provided.');

  const updated = await withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE mail_records SET ${sets.join(', ')} WHERE id = $${values.push(id)}
       RETURNING *`,
      values
    );
    const record = result.rows[0];
    await client.query(
      `INSERT INTO mail_events (record_id, event_type, actor_id, comment)
       VALUES ($1, 'updated', $2, $3)`,
      [id, user.id, input.comment || null]
    );
    if (input.assignedTo && input.assignedTo !== existing.assigned_to) {
      await client.query(
        `INSERT INTO assignments (record_id, assigned_to, assigned_by, note)
         VALUES ($1, $2, $3, $4)`,
        [id, input.assignedTo, user.id, input.comment || null]
      );
      await client.query(
        `INSERT INTO mail_events (record_id, event_type, actor_id, comment)
         VALUES ($1, 'assigned', $2, $3)`,
        [id, user.id, input.comment || null]
      );
    }
    await audit({
      client,
      actorId: user.id,
      action: 'mail.update',
      entity: 'mail_record',
      entityId: id,
      oldValues: existing,
      newValues: record,
      req,
    });
    return record;
  });

  if (input.assignedTo && input.assignedTo !== existing.assigned_to) {
    await notifyUsers(
      [input.assignedTo],
      {
        recordId: id,
        type: 'assignment',
        title: `Courrier assigné : ${updated.reference}`,
        body: input.comment || updated.subject,
      }
    );
  }

  return getMailById(id, user);
}

async function softDeleteMail(id, user, req) {
  const { rows } = await query(
    'SELECT * FROM mail_records WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  const existing = rows[0];
  if (!existing) throw notFound('Mail record not found.');
  assertRecordAccess(existing, user);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE mail_records SET deleted_at = now(), status = 'cancelled' WHERE id = $1`,
      [id]
    );
    await client.query(
      `INSERT INTO mail_events (record_id, event_type, from_status, to_status, actor_id)
       VALUES ($1, 'deleted', $2, 'cancelled', $3)`,
      [id, existing.status, user.id]
    );
    await audit({
      client,
      actorId: user.id,
      action: 'mail.delete',
      entity: 'mail_record',
      entityId: id,
      oldValues: existing,
      req,
    });
  });
}

async function transitionMail(id, action, payload, user, req) {
  const { rows } = await query(
    'SELECT * FROM mail_records WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  const record = rows[0];
  if (!record) throw notFound('Mail record not found.');
  assertRecordAccess(record, user);

  await withTransaction(async (client) => {
    await applyTransition({ client, record, action, payload, user, req });
  });

  return getMailById(id, user);
}

async function addComment(id, body, user, req) {
  const { rows } = await query(
    'SELECT * FROM mail_records WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  const record = rows[0];
  if (!record) throw notFound('Mail record not found.');
  assertRecordAccess(record, user);

  const comment = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO comments (record_id, author_id, body) VALUES ($1, $2, $3) RETURNING *`,
      [id, user.id, body]
    );
    await client.query(
      `INSERT INTO mail_events (record_id, event_type, actor_id, comment)
       VALUES ($1, 'commented', $2, $3)`,
      [id, user.id, body]
    );
    await audit({
      client,
      actorId: user.id,
      action: 'mail.comment',
      entity: 'mail_record',
      entityId: id,
      newValues: result.rows[0],
      req,
    });
    return result.rows[0];
  });

  await notifyStakeholders(
    record,
    {
      type: 'mention',
      title: `Nouveau commentaire : ${record.reference}`,
      body: body.slice(0, 240),
    },
    { excludeUserId: user.id }
  );

  const mentions = [...body.matchAll(/@([a-zA-Z0-9._-]+)/g)].map((match) => match[1]);
  if (mentions.length) {
    const { rows: mentioned } = await query(
      `SELECT id FROM users WHERE lower(username) = ANY($1::text[]) AND deleted_at IS NULL`,
      [mentions.map((name) => name.toLowerCase())]
    );
    await notifyUsers(
      mentioned.map((row) => row.id),
      {
        recordId: id,
        type: 'mention',
        title: `Vous avez été mentionné : ${record.reference}`,
        body: body.slice(0, 240),
      }
    );
  }

  return comment;
}

async function listComments(id, user) {
  const { rows } = await query(
    'SELECT * FROM mail_records WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  assertRecordAccess(rows[0], user);
  const result = await query(
    `SELECT c.*, u.full_name AS author_name, u.matricule AS author_matricule
     FROM comments c LEFT JOIN users u ON u.id = c.author_id
     WHERE c.record_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at ASC`,
    [id]
  );
  return result.rows;
}

async function addAttachment(id, file, user, req) {
  const { rows } = await query(
    'SELECT * FROM mail_records WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  const record = rows[0];
  if (!record) throw notFound('Mail record not found.');
  assertRecordAccess(record, user);

  const sha256 = await checksum(file.path);
  const inserted = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO attachments
        (record_id, filename, original_name, mime_type, size_bytes, storage_key,
         sha256, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        file.filename,
        file.originalname,
        file.mimetype,
        file.size,
        file.filename,
        sha256,
        user.id,
      ]
    );
    await client.query(
      `INSERT INTO mail_events (record_id, event_type, actor_id, comment)
       VALUES ($1, 'attachment_added', $2, $3)`,
      [id, user.id, file.originalname]
    );
    await audit({
      client,
      actorId: user.id,
      action: 'mail.attachment.add',
      entity: 'attachment',
      entityId: result.rows[0].id,
      newValues: { recordId: id, filename: file.originalname, sha256 },
      req,
    });
    return result.rows[0];
  });

  setImmediate(() => {
    processAttachment(inserted.id, file.path, file.mimetype).catch(() => {});
  });

  return inserted;
}

async function getAttachment(id, user) {
  const { rows } = await query(
    `SELECT a.*, m.confidentiality, m.created_by, m.assigned_to, m.department_id
     FROM attachments a
     JOIN mail_records m ON m.id = a.record_id
     WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [id]
  );
  const attachment = rows[0];
  if (!attachment) throw notFound('Attachment not found.');
  assertRecordAccess(attachment, user);
  return attachment;
}

async function deleteAttachment(id, user, req) {
  const attachment = await getAttachment(id, user);
  await withTransaction(async (client) => {
    await client.query('UPDATE attachments SET deleted_at = now() WHERE id = $1', [id]);
    await client.query(
      `INSERT INTO mail_events (record_id, event_type, actor_id, comment)
       VALUES ($1, 'attachment_removed', $2, $3)`,
      [attachment.record_id, user.id, attachment.original_name]
    );
    await audit({
      client,
      actorId: user.id,
      action: 'mail.attachment.delete',
      entity: 'attachment',
      entityId: id,
      oldValues: attachment,
      req,
    });
  });
}

async function listSavedSearches(userId) {
  const { rows } = await query(
    'SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

async function saveSearch(userId, name, searchQuery) {
  const { rows } = await query(
    `INSERT INTO saved_searches (user_id, name, query) VALUES ($1, $2, $3::jsonb)
     RETURNING *`,
    [userId, name, JSON.stringify(searchQuery)]
  );
  return rows[0];
}

async function deleteSavedSearch(userId, id) {
  const { rowCount } = await query(
    'DELETE FROM saved_searches WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rowCount > 0;
}

async function bulkAction(ids, action, payload, user, req) {
  const results = [];
  for (const id of ids) {
    try {
      if (action === 'delete') {
        await softDeleteMail(id, user, req);
        results.push({ id, ok: true });
      } else if (action === 'assign') {
        await updateMail(id, { assignedTo: payload.assignedTo, comment: payload.comment }, user, req);
        results.push({ id, ok: true });
      } else {
        await transitionMail(id, action, payload, user, req);
        results.push({ id, ok: true });
      }
    } catch (error) {
      results.push({ id, ok: false, error: error.message });
    }
  }
  return results;
}

module.exports = {
  MAIL_SELECT,
  accessClause,
  assertRecordAccess,
  buildFilters,
  listMail,
  getMailById,
  createMail,
  updateMail,
  softDeleteMail,
  transitionMail,
  addComment,
  listComments,
  addAttachment,
  getAttachment,
  deleteAttachment,
  listSavedSearches,
  saveSearch,
  deleteSavedSearch,
  bulkAction,
  computeDueAt,
};
