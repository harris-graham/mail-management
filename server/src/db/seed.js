'use strict';

const config = require('../config/env');
const { pool, withTransaction } = require('./pool');
const { hashPassword } = require('../lib/password');

async function seed({ silent = false } = {}) {
  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  await withTransaction(async (client) => {
    const department = await client.query(
      `INSERT INTO departments (code, name)
       VALUES ('DG', 'Direction Générale')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );

    const ministry = await client.query(
      `INSERT INTO ministries (code, name)
       VALUES ('MEF', 'Ministère de l''Économie et des Finances')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );

    const defaults = [
      ['NAT-ORD', 'Courrier ordinaire'],
      ['NAT-NOTE', 'Note'],
      ['NAT-LETTRE', 'Lettre'],
      ['NAT-FACTURE', 'Facture'],
      ['NAT-DEMANDE', 'Demande'],
      ['NAT-RAPPORT', 'Rapport'],
    ];
    for (const [code, name] of defaults) {
      await client.query(
        `INSERT INTO natures (code, name)
         VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [code, name]
      );
    }

    const passwordHash = await hashPassword(config.ADMIN_PASSWORD);
    await client.query(
      `INSERT INTO users
        (matricule, username, full_name, email, password_hash, role,
         department_id, ministry_id, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, 'admin', $6, $7, true, true)
       ON CONFLICT (matricule) DO NOTHING`,
      [
        config.ADMIN_MATRICULE,
        config.ADMIN_MATRICULE,
        config.ADMIN_FULL_NAME,
        config.ADMIN_EMAIL,
        passwordHash,
        department.rows[0].id,
        ministry.rows[0].id,
      ]
    );

    const settings = [
      ['organization.name', JSON.stringify('Gestion de Courrier')],
      ['organization.ministry', JSON.stringify("Ministère de l'Économie et des Finances")],
      ['organization.locale', JSON.stringify('fr')],
      ['sla.low.hours', JSON.stringify(120)],
      ['sla.normal.hours', JSON.stringify(72)],
      ['sla.high.hours', JSON.stringify(24)],
      ['sla.urgent.hours', JSON.stringify(8)],
      ['security.sessionDays', JSON.stringify(config.REFRESH_TOKEN_DAYS)],
      ['notifications.emailEnabled', JSON.stringify(Boolean(config.SMTP_HOST))],
      ['retention.archiveYears', JSON.stringify(10)],
    ];
    for (const [key, value] of settings) {
      await client.query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }
  });

  log('Seed completed.');
  log(`Administrator: ${config.ADMIN_MATRICULE} (password from ADMIN_PASSWORD)`);
}

if (require.main === module) {
  seed()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error(error);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { seed };
