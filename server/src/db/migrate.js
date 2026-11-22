'use strict';

const fs = require('fs/promises');
const path = require('path');
const { pool } = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function appliedVersions(client) {
  await ensureMigrationTable(client);
  const { rows } = await client.query(
    'SELECT version, applied_at FROM schema_migrations ORDER BY version'
  );
  return rows;
}

async function runMigrations({ silent = false } = {}) {
  const client = await pool.connect();
  const applied = [];
  try {
    const already = new Set((await appliedVersions(client)).map((row) => row.version));
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (already.has(version)) continue;

      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      if (!silent) console.log(`Applying migration ${version}…`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
          [version]
        );
        await client.query('COMMIT');
        applied.push(version);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${version} failed: ${error.message}`, { cause: error });
      }
    }
    return applied;
  } finally {
    client.release();
  }
}

async function getMigrationStatus() {
  const client = await pool.connect();
  try {
    const rows = await appliedVersions(client);
    const files = (await fs.readdir(MIGRATIONS_DIR))
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => file.replace(/\.sql$/, ''));
    const appliedNames = new Set(rows.map((row) => row.version));
    return {
      applied: rows,
      pending: files.filter((file) => !appliedNames.has(file)),
      currentVersion: rows.length ? rows[rows.length - 1].version : null,
    };
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then((applied) => {
      if (!applied.length) console.log('Database is already up to date.');
      else console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
      return pool.end();
    })
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { runMigrations, getMigrationStatus, MIGRATIONS_DIR };
