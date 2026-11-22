'use strict';

const { query } = require('../db/pool');
const { decrypt } = require('../lib/crypto');
const logger = require('../lib/logger');

async function syncAccount(account, actorId) {
  const { ImapFlow } = await import('imapflow');
  const { simpleParser } = await import('mailparser');

  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: {
      user: account.username,
      pass: decrypt(account.password_encrypted),
    },
    logger: false,
  });

  const created = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock(account.folder);
    try {
      for await (const message of client.fetch(
        { seen: false },
        { source: true, envelope: true }
      )) {
        const parsed = await simpleParser(message.source);
        const messageId = parsed.messageId || `${account.id}-${message.uid}`;
        const existing = await query(
          'SELECT id FROM email_messages WHERE message_id = $1',
          [messageId]
        );
        if (existing.rows[0]) continue;

        const { rows } = await query(
          `INSERT INTO email_messages
            (account_id, message_id, subject, from_address, to_address,
             received_at, processed, raw)
           VALUES ($1, $2, $3, $4, $5, $6, false, $7)
           RETURNING *`,
          [
            account.id,
            messageId,
            parsed.subject || '(sans objet)',
            parsed.from?.text || null,
            parsed.to?.text || null,
            parsed.date || new Date(),
            JSON.stringify({
              subject: parsed.subject,
              from: parsed.from?.text,
              text: parsed.text?.slice(0, 50_000),
            }),
          ]
        );

        const reference = `MAIL-${new Date().getFullYear()}-${String(
          Date.now()
        ).slice(-6)}`;
        const mail = await query(
          `INSERT INTO mail_records
            (reference, type, status, subject, analysis, received_at, created_by,
             metadata)
           VALUES ($1, 'correspondance', 'registered', $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            reference,
            parsed.subject || '(sans objet)',
            parsed.text?.slice(0, 20_000) || null,
            (parsed.date || new Date()).toISOString().slice(0, 10),
            actorId,
            JSON.stringify({
              source: 'imap',
              accountId: account.id,
              messageId,
              from: parsed.from?.text,
            }),
          ]
        );

        await query(
          'UPDATE email_messages SET processed = true, record_id = $1 WHERE id = $2',
          [mail.rows[0].id, rows[0].id]
        );
        created.push(mail.rows[0]);
      }
    } finally {
      lock.release();
    }
    await query(
      'UPDATE email_accounts SET last_sync_at = now() WHERE id = $1',
      [account.id]
    );
  } finally {
    await client.logout().catch(() => {});
  }
  return created;
}

async function syncAllAccounts() {
  const { rows } = await query(
    'SELECT * FROM email_accounts WHERE active = true ORDER BY created_at'
  );
  const admin = await query(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY created_at LIMIT 1"
  );
  if (!admin.rows[0]) return [];
  const results = [];
  for (const account of rows) {
    try {
      const created = await syncAccount(account, admin.rows[0].id);
      results.push({ accountId: account.id, created: created.length });
    } catch (error) {
      logger.error({ err: error, accountId: account.id }, 'IMAP sync failed');
      results.push({ accountId: account.id, error: error.message });
    }
  }
  return results;
}

module.exports = { syncAccount, syncAllAccounts };
