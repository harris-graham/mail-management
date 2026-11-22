#!/usr/bin/env node
/**
 * Destructive helper for disposable development databases.
 * Requires CONFIRM_RESET=YES.
 */
import 'dotenv/config';
import pg from 'pg';

if (process.env.CONFIRM_RESET !== 'YES') {
  console.error('Refusing to reset. Set CONFIRM_RESET=YES to continue.');
  process.exit(1);
}

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://mail:mail@localhost:5432/mail_management',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  console.log('Schema reset. Run `npm run db:migrate` and `npm run db:seed`.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
