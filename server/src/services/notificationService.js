'use strict';

const { query } = require('../db/pool');
const { emitToUser } = require('../realtime');
const logger = require('../lib/logger');

async function createNotification({
  userId,
  recordId = null,
  type = 'info',
  title,
  body = null,
  client = null,
}) {
  const runner = client || { query };
  const { rows } = await runner.query(
    `INSERT INTO notifications (user_id, record_id, type, title, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, recordId, type, title, body]
  );
  const notification = rows[0];
  emitToUser(userId, 'notification:new', notification);
  return notification;
}

async function notifyUsers(userIds, payload, client = null) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return [];
  const results = [];
  for (const userId of unique) {
    try {
      results.push(await createNotification({ ...payload, userId, client }));
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to create notification');
    }
  }
  return results;
}

async function notifyStakeholders(record, payload, { excludeUserId = null, client = null } = {}) {
  const { rows } = await query(
    'SELECT user_id FROM mail_watchers WHERE record_id = $1',
    [record.id]
  );
  const userIds = [
    record.created_by,
    record.assigned_to,
    ...rows.map((row) => row.user_id),
  ].filter((id) => id && id !== excludeUserId);
  return notifyUsers(userIds, { ...payload, recordId: record.id }, client);
}

async function listNotifications(userId, { unreadOnly = false, limit = 30 } = {}) {
  const { rows } = await query(
    `SELECT n.*, m.reference AS mail_reference, m.subject AS mail_subject
     FROM notifications n
     LEFT JOIN mail_records m ON m.id = n.record_id
     WHERE n.user_id = $1 ${unreadOnly ? 'AND n.read_at IS NULL' : ''}
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [userId, Math.min(Number(limit) || 30, 100)]
  );
  return rows;
}

async function unreadCount(userId) {
  const { rows } = await query(
    'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  );
  return rows[0].count;
}

async function markRead(userId, notificationId) {
  const { rows } = await query(
    `UPDATE notifications SET read_at = now()
     WHERE id = $1 AND user_id = $2 AND read_at IS NULL
     RETURNING *`,
    [notificationId, userId]
  );
  return rows[0] || null;
}

async function markAllRead(userId) {
  const { rowCount } = await query(
    'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  );
  return rowCount;
}

module.exports = {
  createNotification,
  notifyUsers,
  notifyStakeholders,
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
};
