'use strict';

const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../lib/logger');
const { query } = require('../db/pool');

let transporter = null;

function getTransporter() {
  if (!config.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      auth: config.SMTP_USER
        ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, text, html, attachments }) {
  const transport = getTransporter();
  if (!transport) {
    logger.debug({ to, subject }, 'SMTP is not configured; email skipped');
    return { skipped: true };
  }
  const info = await transport.sendMail({
    from: config.SMTP_FROM,
    to,
    subject,
    text,
    html,
    attachments,
  });
  return { skipped: false, messageId: info.messageId };
}

async function sendNotificationEmail(user, notification) {
  if (!user?.email) return { skipped: true };
  return sendMail({
    to: user.email,
    subject: notification.title,
    text: notification.body || notification.title,
  });
}

async function sendMailRecord(record, to, pdfBuffer) {
  return sendMail({
    to,
    subject: `Courrier ${record.reference} — ${record.subject || ''}`.trim(),
    text: `Veuillez trouver ci-joint la fiche du courrier ${record.reference}.`,
    attachments: pdfBuffer
      ? [{ filename: `${record.reference}.pdf`, content: pdfBuffer }]
      : undefined,
  });
}

async function notifyEmailRecipients(record, notification) {
  const { rows } = await query(
    `SELECT DISTINCT u.id, u.email, u.full_name
     FROM users u
     WHERE u.email IS NOT NULL AND u.deleted_at IS NULL AND u.is_active
       AND (u.id = $1 OR u.id = $2 OR u.id IN (
         SELECT user_id FROM mail_watchers WHERE record_id = $3
       ))`,
    [record.created_by, record.assigned_to, record.id]
  );
  for (const user of rows) {
    await sendNotificationEmail(user, notification).catch((error) =>
      logger.warn({ err: error, userId: user.id }, 'Notification email failed')
    );
  }
}

module.exports = { sendMail, sendNotificationEmail, sendMailRecord, notifyEmailRecipients };
