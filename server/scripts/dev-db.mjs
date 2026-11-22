#!/usr/bin/env node
/**
 * Start a local, disposable PostgreSQL 17 cluster without Docker or admin
 * rights. Data is persisted in `.pgdata/` and ignored by git.
 *
 *   npm run db:dev
 *
 * The API then connects with:
 *   postgres://mail:mail@localhost:5433/mail_management
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import EmbeddedPostgres from 'embedded-postgres';

const dataDir = path.resolve(process.cwd(), process.env.PG_DATA_DIR || '.pgdata');
const port = Number(process.env.PG_DEV_PORT || 5433);
const user = process.env.PG_DEV_USER || 'mail';
const password = process.env.PG_DEV_PASSWORD || 'mail';
const database = process.env.PG_DEV_DATABASE || 'mail_management';

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user,
  password,
  persistent: true,
  autoRehydrateSymlinks: true,
  onLog: (message) => process.stdout.write(message),
  onError: (error) => console.error(error),
});

const initialised = fs.existsSync(path.join(dataDir, 'PG_VERSION'));

async function main() {
  if (!initialised) {
    console.log(`Initialising PostgreSQL cluster in ${dataDir}…`);
    await pg.initialise();
  }

  await pg.start();
  console.log(`PostgreSQL is listening on port ${port}.`);

  try {
    await pg.createDatabase(database);
    console.log(`Created database "${database}".`);
  } catch {
    console.log(`Database "${database}" already exists.`);
  }

  console.log('');
  console.log(`DATABASE_URL=postgres://${user}:${password}@localhost:${port}/${database}`);
  console.log('');
  console.log('Press Ctrl+C to stop the cluster.');

  const shutdown = async () => {
    console.log('\nStopping PostgreSQL…');
    await pg.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown);
}

main().catch((error) => {
  console.error('Failed to start the embedded PostgreSQL cluster:', error);
  process.exit(1);
});
