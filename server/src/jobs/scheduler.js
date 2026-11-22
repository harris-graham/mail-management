'use strict';

const cron = require('node-cron');
const { query } = require('../db/pool');
const config = require('../config/env');
const logger = require('../lib/logger');
const { createNotification } = require('../services/notificationService');
const { syncAllAccounts } = require('../services/emailIngest');

let started = false;

async function checkDeadlines() {
  const { rows } = await query(
    `SELECT m.id, m.reference, m.subject, m.assigned_to, m.created_by, m.due_at
     FROM mail_records m
     WHERE m.deleted_at IS NULL
       AND m.due_at IS NOT NULL
       AND m.due_at < now() + interval '24 hours'
       AND m.status NOT IN ('processed', 'archived', 'cancelled')
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.record_id = m.id
           AND n.type = 'deadline'
           AND n.created_at > now() - interval '24 hours'
       )`
  );

  for (const record of rows) {
    for (const userId of [record.assigned_to, record.created_by].filter(Boolean)) {
      await createNotification({
        userId,
        recordId: record.id,
        type: 'deadline',
        title: `Échéance proche : ${record.reference}`,
        body: `Le courrier « ${record.subject || ''} » arrive à échéance.`,
      });
    }
  }
  if (rows.length) logger.info({ count: rows.length }, 'Deadline reminders created');
  return rows.length;
}

async function cleanup() {
  const refresh = await query(
    "DELETE FROM refresh_tokens WHERE expires_at < now() OR revoked_at < now() - interval '30 days'"
  );
  const reset = await query('DELETE FROM password_reset_tokens WHERE expires_at < now()');
  const notifications = await query(
    "DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < now() - interval '90 days'"
  );
  logger.info(
    {
      refreshTokens: refresh.rowCount,
      resetTokens: reset.rowCount,
      notifications: notifications.rowCount,
    },
    'Scheduled cleanup completed'
  );
}

async function emailSync() {
  if (!config.IMAP_HOST) return;
  const results = await syncAllAccounts();
  if (results.length) logger.info({ results }, 'IMAP sync completed');
}

function startScheduler() {
  if (started || !config.ENABLE_SCHEDULER) return;
  started = true;

  cron.schedule('*/15 * * * *', () => {
    checkDeadlines().catch((error) => logger.error({ err: error }, 'Deadline job failed'));
  });
  cron.schedule('0 3 * * *', () => {
    cleanup().catch((error) => logger.error({ err: error }, 'Cleanup job failed'));
  });
  cron.schedule('*/5 * * * *', () => {
    emailSync().catch((error) => logger.error({ err: error }, 'IMAP job failed'));
  });

  logger.info('Background scheduler started');
}

module.exports = { startScheduler, checkDeadlines, cleanup, emailSync };
