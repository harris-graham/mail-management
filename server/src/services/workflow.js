'use strict';

const { PERMISSIONS, hasPermission } = require('../lib/permissions');
const { conflict, forbidden, badRequest, notFound } = require('../lib/errors');
const { audit } = require('../lib/audit');
const { TRANSITIONS, allowedActions } = require('../lib/workflowState');
const { notifyStakeholders, createNotification } = require('./notificationService');

const ACTION_PERMISSIONS = Object.freeze({
  approve_visa: PERMISSIONS.MAIL_VISA,
  reject_visa: PERMISSIONS.MAIL_REJECT,
  archive: PERMISSIONS.MAIL_ARCHIVE,
  restore: PERMISSIONS.MAIL_RESTORE,
  assign: PERMISSIONS.MAIL_ASSIGN,
});

const ACTION_EVENTS = Object.freeze({
  approve_visa: 'visa_approved',
  reject_visa: 'visa_rejected',
  archive: 'archived',
  restore: 'restored',
  assign: 'assigned',
});

function assertTransition(record, action, user) {
  const nextStatus = TRANSITIONS[record.status]?.[action];
  if (!nextStatus) {
    throw conflict(
      `Action "${action}" is not allowed while the record is "${record.status}".`,
      { allowedActions: allowedActions(record.status) }
    );
  }
  const permission = ACTION_PERMISSIONS[action] || PERMISSIONS.MAIL_UPDATE;
  if (!hasPermission(user, permission)) {
    throw forbidden(`Missing permission: ${permission}`);
  }
  return nextStatus;
}

async function applyTransition({ client, record, action, payload = {}, user, req }) {
  const nextStatus = assertTransition(record, action, user);
  const updates = { status: nextStatus };

  if (action === 'approve_visa') {
    if (!payload.decidedAt) throw badRequest('decidedAt is required to approve a visa.');
    if (!payload.projetVise) throw badRequest('projetVise is required to approve a visa.');
    updates.decided_at = payload.decidedAt;
    updates.projet_vise = payload.projetVise;
    updates.observation = payload.observation || 'Visé';
  }

  if (action === 'reject_visa') {
    if (!payload.observation) throw badRequest('observation is required to reject a visa.');
    updates.decided_at = payload.decidedAt || new Date().toISOString().slice(0, 10);
    updates.observation = payload.observation;
  }

  if (action === 'assign') {
    if (!payload.assignedTo) throw badRequest('assignedTo is required.');
    const { rows } = await client.query(
      'SELECT id FROM users WHERE id = $1 AND is_active AND deleted_at IS NULL',
      [payload.assignedTo]
    );
    if (!rows[0]) throw notFound('The selected assignee does not exist.');
    updates.assigned_to = payload.assignedTo;
    await client.query(
      `INSERT INTO assignments (record_id, assigned_to, assigned_by, note)
       VALUES ($1, $2, $3, $4)`,
      [record.id, payload.assignedTo, user.id, payload.comment || null]
    );
  }

  if (payload.dueAt) updates.due_at = payload.dueAt;
  if (action === 'archive') updates.archived_at = new Date().toISOString();
  if (action === 'restore') {
    updates.archived_at = null;
    updates.closed_at = null;
  }
  if (nextStatus === 'processed') updates.closed_at = new Date().toISOString();

  const { rows } = await client.query(
    `UPDATE mail_records
     SET status = $1,
         decided_at = COALESCE($2, decided_at),
         projet_vise = COALESCE($3, projet_vise),
         observation = COALESCE($4, observation),
         assigned_to = COALESCE($5, assigned_to),
         due_at = COALESCE($6, due_at),
         archived_at = $7,
         closed_at = $8
     WHERE id = $9
     RETURNING *`,
    [
      updates.status,
      updates.decided_at || null,
      updates.projet_vise || null,
      updates.observation || null,
      updates.assigned_to || null,
      updates.due_at || null,
      updates.archived_at === undefined ? record.archived_at : updates.archived_at,
      updates.closed_at === undefined ? record.closed_at : updates.closed_at,
      record.id,
    ]
  );
  const updated = rows[0];

  await client.query(
    `INSERT INTO mail_events
      (record_id, event_type, from_status, to_status, actor_id, comment, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      record.id,
      ACTION_EVENTS[action] || 'status_changed',
      record.status,
      nextStatus,
      user.id,
      payload.comment || null,
      JSON.stringify({ action, ...payload }),
    ]
  );

  await audit({
    client,
    actorId: user.id,
    action: `mail.${action}`,
    entity: 'mail_record',
    entityId: record.id,
    oldValues: { status: record.status, assigned_to: record.assigned_to },
    newValues: { status: nextStatus, ...updates },
    req,
  });

  if (action === 'assign') {
    await createNotification({
      client,
      userId: payload.assignedTo,
      recordId: record.id,
      type: 'assignment',
      title: `Nouveau courrier assigné : ${record.reference}`,
      body: payload.comment || record.subject || null,
    });
  }

  await notifyStakeholders(
    updated,
    {
      type: action === 'archive' ? 'info' : 'status',
      title: `Statut mis à jour : ${record.reference}`,
      body: `${record.status} → ${nextStatus}`,
    },
    { excludeUserId: user.id, client }
  );

  return updated;
}

module.exports = { TRANSITIONS, ACTION_PERMISSIONS, allowedActions, applyTransition };
