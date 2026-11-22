'use strict';

const { Pool, types } = require('pg');
const config = require('../config/env');

// PostgreSQL DATE values are calendar dates, not instants. Returning the raw
// string avoids timezone shifts when the API serialises them.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DB_SSL ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  application_name: 'mail-management-api',
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  const started = Date.now();
  const { rows } = await pool.query('SELECT current_database() AS database, version() AS version');
  return {
    ok: true,
    database: rows[0].database,
    version: rows[0].version,
    latencyMs: Date.now() - started,
  };
}

module.exports = { pool, query, withTransaction, healthCheck };
