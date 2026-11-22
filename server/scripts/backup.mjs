#!/usr/bin/env node
/**
 * Create a portable JSON backup of the PostgreSQL database.
 * Usage: npm run db:backup
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://mail:mail@localhost:5432/mail_management',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

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

async function main() {
  const dump = {
    metadata: {
      generatedAt: new Date().toISOString(),
      format: 'mail-management-json-backup',
      version: 1,
    },
    tables: {},
  };
  for (const table of tables) {
    const { rows } = await pool.query(`SELECT * FROM ${table}`);
    dump.tables[table] = rows;
    console.log(`  ${table}: ${rows.length}`);
  }

  const dir = path.resolve(process.cwd(), 'backups');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `mail-management-${Date.now()}.json`);
  await fs.writeFile(file, JSON.stringify(dump, null, 2), 'utf8');
  console.log(`Backup written to ${file}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
