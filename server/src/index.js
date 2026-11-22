'use strict';

const http = require('http');
const app = require('./app');
const config = require('./config/env');
const logger = require('./lib/logger');
const { initSocket } = require('./realtime');
const { startScheduler } = require('./jobs/scheduler');
const { ensureUploadDir } = require('./lib/storage');
const { pool } = require('./db/pool');

async function main() {
  await ensureUploadDir();

  const server = http.createServer(app);
  initSocket(server, config.CORS_ORIGINS_LIST);

  server.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      'Mail management API listening'
    );
  });

  startScheduler();

  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start API');
  process.exit(1);
});
