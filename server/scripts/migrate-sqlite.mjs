#!/usr/bin/env node
/**
 * Import the legacy SQLite database into PostgreSQL.
 *
 * Usage:
 *   node scripts/migrate-sqlite.mjs [path/to/mail_management.db]
 *   SQLITE_PATH=... IMPORT_ACTOR_ID=<uuid> node scripts/migrate-sqlite.mjs
 *
 * The import is idempotent: records are keyed by legacy_key and existing rows
 * are left untouched. A report with source and target counts is printed.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
dotenv.config({
  path: process.env.ENV_FILE || [
    path.resolve(scriptDir, '../../../.env'),
    path.resolve(scriptDir, '../../.env'),
  ],
});

const sqlitePath =
  process.argv[2] ||
  process.env.SQLITE_PATH ||
  path.resolve(process.cwd(), 'mail_management.db');

if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite database not found: ${sqlitePath}`);
  process.exit(1);
}

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://mail:mail@localhost:5432/mail_management',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const db = new DatabaseSync(sqlitePath, { readOnly: true });

const sha = (value) =>
  createHash('sha1').update(String(value)).digest('hex').slice(0, 10).toUpperCase();

const clean = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const toDate = (value) => {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const toTimestamp = (value) => {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function rows(table) {
  try {
    return db.prepare(`SELECT * FROM ${table}`).all();
  } catch {
    return [];
  }
}

async function upsertMinistry(client, name) {
  const label = clean(name);
  if (!label) return null;
  const code = `MIN-${sha(label)}`;
  const { rows: inserted } = await client.query(
    `INSERT INTO ministries (code, name) VALUES ($1, $2)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [code, label]
  );
  return inserted[0].id;
}

async function upsertService(client, ministryId, name) {
  const label = clean(name);
  if (!label || !ministryId) return null;
  const code = `SRV-${sha(label)}`;
  const { rows: inserted } = await client.query(
    `INSERT INTO services (ministry_id, code, name) VALUES ($1, $2, $3)
     ON CONFLICT (ministry_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [ministryId, code, label]
  );
  return inserted[0].id;
}

async function upsertNature(client, oldId, name) {
  const label = clean(name) || `Nature ${oldId}`;
  const code = `NAT-${oldId}`;
  const existing = await client.query('SELECT id FROM natures WHERE name = $1', [label]);
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows: inserted } = await client.query(
    `INSERT INTO natures (code, name) VALUES ($1, $2)
     ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [code, label]
  );
  return inserted[0].id;
}

async function resolveActor(client) {
  if (process.env.IMPORT_ACTOR_ID) {
    const found = await client.query('SELECT id FROM users WHERE id = $1', [
      process.env.IMPORT_ACTOR_ID,
    ]);
    if (found.rows[0]) return found.rows[0].id;
  }
  const admin = await client.query(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL ORDER BY created_at LIMIT 1"
  );
  return admin.rows[0]?.id || null;
}

async function main() {
  const sourceCounts = {
    utilisateur: rows('utilisateur').length,
    nature: rows('nature').length,
    correspondance: rows('correspondance').length,
    archive: rows('archive').length,
    consultation: rows('consultation').length,
    def: rows('def').length,
    visa: rows('visa').length,
    correspondance_data: rows('correspondance_data').length,
    nature_data: rows('nature_data').length,
  };

  const report = { sourceCounts, inserted: {}, warnings: [] };
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const actorId = await resolveActor(client);
    if (!actorId) throw new Error('No administrator exists. Run `npm run db:seed` first.');

    // Users -----------------------------------------------------------------
    const userMap = new Map();
    for (const row of rows('utilisateur')) {
      const matricule = clean(row.util_id);
      if (!matricule) continue;
      const username = clean(row.util_nom_util) || matricule;
      const role = String(row.util_type || '').toLowerCase() === 'admin' ? 'admin' : 'agent';
      const passwordHash = await bcrypt.hash(clean(row.util_mdp) || 'ChangeMe@12345', 10);
      const inserted = await client.query(
        `INSERT INTO users
          (matricule, username, full_name, password_hash, role, is_active,
           must_change_password)
         VALUES ($1, $2, $3, $4, $5, true, true)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [matricule, username, username, passwordHash, role]
      );
      let id = inserted.rows[0]?.id;
      if (!id) {
        const existing = await client.query(
          `SELECT id FROM users
           WHERE matricule = $1 OR lower(username) = lower($2)
           ORDER BY (matricule = $1) DESC
           LIMIT 1`,
          [matricule, username]
        );
        id = existing.rows[0]?.id;
      }
      if (id) userMap.set(matricule, id);
    }
    report.inserted.users = userMap.size;

    // Natures ---------------------------------------------------------------
    const natureMap = new Map();
    for (const row of rows('nature')) {
      const id = await upsertNature(client, row.nat_id, row.nat_nom);
      natureMap.set(row.nat_id, id);
    }
    report.inserted.natures = natureMap.size;

    // Correspondance + archive ---------------------------------------------
    const archiveRows = rows('archive');
    const archiveMap = new Map(archiveRows.map((row) => [row.arch_id, row]));
    const correspondanceRows = rows('correspondance');
    const corrIds = new Set(correspondanceRows.map((row) => row.corr_id));
    let corrInserted = 0;

    for (const row of correspondanceRows) {
      const archive = archiveMap.get(row.corr_id) || null;
      const observation = clean(row.corr_observation);
      let status = 'registered';
      if (archive) status = 'archived';
      else if (observation === 'Rejeté') status = 'visa_rejected';
      else if (observation === 'Visé' || clean(row.corr_date_decision)) status = 'visa_approved';
      else if (clean(row.corr_projet_vise)) status = 'pending_visa';

      const ministryId = await upsertMinistry(client, row.corr_ministere);
      const serviceId = await upsertService(client, ministryId, row.corr_service);
      const natureId = natureMap.get(row.nat_id) || null;
      const legacyKey = `correspondance:${row.corr_id}`;
      const reference = `CORR-${String(row.corr_id).padStart(6, '0')}`;

      const inserted = await client.query(
        `INSERT INTO mail_records
          (reference, type, status, priority, confidentiality, subject, analysis,
           observation, bordereau, projet_vise, ministry_id, service_id, nature_id,
           created_by, received_at, deposited_at, decided_at, archived_at,
           legacy_key, legacy_id, legacy_archive_id, metadata)
         VALUES ($1, 'correspondance', $2, 'normal', 'internal', $3, $4, $5, $6,
                 $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (legacy_key) DO NOTHING
         RETURNING id`,
        [
          reference,
          status,
          clean(row.corr_analyse),
          clean(row.corr_analyse),
          observation,
          clean(row.corr_bordereau),
          clean(row.corr_projet_vise),
          ministryId,
          serviceId,
          natureId,
          userMap.get(clean(row.util_id)) || actorId,
          toDate(row.corr_date_depot) || toDate(row.corr_date_creat),
          toDate(row.corr_date_depot),
          toDate(row.corr_date_decision),
          archive ? toTimestamp(archive.arch_date_decision || archive.arch_date_depot) : null,
          legacyKey,
          row.corr_id,
          archive?.arch_id || null,
          JSON.stringify({ legacy: row, archive }),
        ]
      );

      if (inserted.rows[0]) {
        corrInserted += 1;
        await client.query(
          `INSERT INTO mail_events (record_id, event_type, to_status, actor_id, metadata)
           VALUES ($1, 'created', $2, $3, $4)`,
          [inserted.rows[0].id, status, actorId, JSON.stringify({ source: 'sqlite' })]
        );
      }
    }

    // Archives without a matching correspondance row.
    for (const row of archiveRows) {
      if (corrIds.has(row.arch_id)) continue;
      const ministryId = await upsertMinistry(client, row.arch_ministere);
      const serviceId = await upsertService(client, ministryId, row.arch_service);
      const inserted = await client.query(
        `INSERT INTO mail_records
          (reference, type, status, priority, confidentiality, subject, analysis,
           observation, bordereau, projet_vise, ministry_id, service_id, nature_id,
           created_by, received_at, deposited_at, decided_at, archived_at,
           legacy_key, legacy_id, legacy_archive_id, metadata)
         VALUES ($1, 'correspondance', 'archived', 'normal', 'internal', $2, $3, $4,
                 $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (legacy_key) DO NOTHING
         RETURNING id`,
        [
          `ARCH-${String(row.arch_id).padStart(6, '0')}`,
          clean(row.arch_analyse),
          clean(row.arch_analyse),
          clean(row.arch_observation),
          clean(row.arch_bordereau),
          clean(row.arch_projet_vise),
          ministryId,
          serviceId,
          natureMap.get(row.nat_id) || null,
          userMap.get(clean(row.util_id)) || actorId,
          toDate(row.arch_date_depot),
          toDate(row.arch_date_depot),
          toDate(row.arch_date_decision),
          toTimestamp(row.arch_date_decision || row.arch_date_depot),
          `archive:${row.arch_id}`,
          row.arch_id,
          row.arch_id,
          JSON.stringify({ legacyArchive: row }),
        ]
      );
      if (inserted.rows[0]) corrInserted += 1;
    }
    report.inserted.correspondances = corrInserted;

    // Consultations ---------------------------------------------------------
    let consInserted = 0;
    for (const row of rows('consultation')) {
      const inserted = await client.query(
        `INSERT INTO mail_records
          (reference, type, status, priority, confidentiality, subject, analysis,
           received_at, due_at, created_by, legacy_key, legacy_id, metadata)
         VALUES ($1, 'consultation', 'registered', 'normal', 'internal', $2, $3,
                 $4, $5, $6, $7, $8, $9)
         ON CONFLICT (legacy_key) DO NOTHING
         RETURNING id`,
        [
          `CONS-${String(row.cons_id).padStart(6, '0')}`,
          clean(row.cons_description),
          clean(row.cons_description),
          toDate(row.cons_date_arrive),
          toTimestamp(row.cons_date_pli),
          userMap.get(clean(row.util_id)) || actorId,
          `consultation:${row.cons_id}`,
          row.cons_id,
          JSON.stringify({
            legacy: row,
            origine: row.cons_origine,
            dateAffichage: row.cons_date_affichage,
            datePli: row.cons_date_pli,
          }),
        ]
      );
      if (inserted.rows[0]) consInserted += 1;
    }
    report.inserted.consultations = consInserted;

    // Financial engagement requests ----------------------------------------
    let defInserted = 0;
    for (const row of rows('def')) {
      const inserted = await client.query(
        `INSERT INTO mail_records
          (reference, type, status, priority, confidentiality, subject, analysis,
           observation, bordereau, received_at, created_by, legacy_key, legacy_id,
           metadata)
         VALUES ($1, 'def', $2, 'normal', 'internal', $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (legacy_key) DO NOTHING
         RETURNING id`,
        [
          `DEF-${String(row.def_id).padStart(6, '0')}`,
          clean(row.def_observation) ? 'processed' : 'registered',
          clean(row.def_nature),
          clean(row.def_observation),
          clean(row.def_observation),
          clean(row.def_bordereau),
          toDate(row.def_date_depot),
          userMap.get(clean(row.util_id)) || actorId,
          `def:${row.def_id}`,
          row.def_id,
          JSON.stringify({ legacy: row, natureLabel: row.def_nature }),
        ]
      );
      if (inserted.rows[0]) defInserted += 1;
    }
    report.inserted.defs = defInserted;

    // Preserve unused legacy tables for auditability.
    for (const table of ['visa', 'correspondance_data', 'nature_data']) {
      const sourceRows = rows(table);
      for (let index = 0; index < sourceRows.length; index += 1) {
        const row = sourceRows[index];
        const rowKey = String(
          row.Num_ordre ?? row.corr_id ?? row.nat_id ?? row.id ?? index
        );
        await client.query(
          `INSERT INTO legacy_rows (source_table, row_key, data)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (source_table, row_key) DO NOTHING`,
          [table, rowKey, JSON.stringify(row)]
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    db.close();
    await pool.end();
  }

  console.log('SQLite import complete.');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('SQLite import failed:', error);
  process.exit(1);
});
