'use strict';

/**
 * End-to-end smoke test against the real PostgreSQL database.
 *
 *   npm run smoke
 *
 * Requires a migrated, seeded database reachable through DATABASE_URL.
 */

const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const health = await request(app).get('/api/v1/health');
  record('GET /health', health.status === 200, `status ${health.status}`);

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({
      matricule: process.env.SMOKE_MATRICULE || 'admin',
      password: process.env.SMOKE_PASSWORD || 'Admin@12345',
    });
  record(
    'POST /auth/login',
    login.status === 200 && Boolean(login.body.accessToken),
    `status ${login.status}`
  );
  if (login.status !== 200) {
    console.error(login.body);
    return finish();
  }

  const token = login.body.accessToken;
  const auth = { Authorization: `Bearer ${token}` };
  const cookieHeader = (login.headers['set-cookie'] || [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  const csrf = login.body.csrfToken;

  const me = await request(app).get('/api/v1/auth/me').set(auth);
  record('GET /auth/me', me.status === 200 && me.body.user?.role === 'admin');

  const reference = await request(app).get('/api/v1/reference-data').set(auth);
  record(
    'GET /reference-data',
    reference.status === 200 && Array.isArray(reference.body.natures),
    `${reference.body.natures?.length ?? 0} natures`
  );

  const assignable = await request(app).get('/api/v1/users/assignable').set(auth);
  record(
    'GET /users/assignable',
    assignable.status === 200 && Array.isArray(assignable.body.data),
    `${assignable.body.data?.length ?? 0} users`
  );

  const list = await request(app).get('/api/v1/mail?pageSize=5&sort=received_at').set(auth);
  record(
    'GET /mail',
    list.status === 200 && Array.isArray(list.body.data),
    `${list.body.pagination?.total ?? 0} records`
  );

  let detailId = list.body.data?.[0]?.id;
  if (detailId) {
    const detail = await request(app).get(`/api/v1/mail/${detailId}`).set(auth);
    record('GET /mail/:id', detail.status === 200 && Boolean(detail.body.data?.reference));
  }

  const search = await request(app).get('/api/v1/mail?q=a&pageSize=3').set(auth);
  record('GET /mail?q=', search.status === 200, `status ${search.status}`);

  const summary = await request(app).get('/api/v1/analytics/summary').set(auth);
  record(
    'GET /analytics/summary',
    summary.status === 200 && typeof summary.body.data?.total === 'number',
    `total ${summary.body.data?.total}`
  );

  const timeseries = await request(app)
    .get('/api/v1/analytics/timeseries?interval=month')
    .set(auth);
  record(
    'GET /analytics/timeseries',
    timeseries.status === 200 && Array.isArray(timeseries.body.data)
  );

  const dbStatus = await request(app).get('/api/v1/admin/db/status').set(auth);
  record(
    'GET /admin/db/status',
    dbStatus.status === 200 && dbStatus.body.database?.ok === true,
    dbStatus.body.database?.version?.split(',')[0]
  );

  const audit = await request(app).get('/api/v1/admin/audit?pageSize=5').set(auth);
  record(
    'GET /admin/audit',
    audit.status === 200 && Array.isArray(audit.body.data),
    `${audit.body.pagination?.total ?? 0} entries`
  );

  if (detailId) {
    const pdf = await request(app).get(`/api/v1/mail/${detailId}/pdf`).set(auth);
    record(
      'GET /mail/:id/pdf',
      pdf.status === 200 && pdf.headers['content-type']?.includes('pdf'),
      `${pdf.body?.length ?? 0} bytes`
    );
  }

  const logout = await request(app)
    .post('/api/v1/auth/logout')
    .set(auth)
    .set('Cookie', cookieHeader)
    .set('X-Requested-With', 'XMLHttpRequest')
    .set('x-csrf-token', csrf || '');
  record('POST /auth/logout', logout.status === 200, `status ${logout.status}`);

  return finish();
}

async function finish() {
  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  await pool.end().catch(() => {});
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => {});
  process.exit(1);
});
