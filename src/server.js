import app from './app.js';
import { env } from './config/env.js';
import { pool } from './db/pool.js';

const server = app.listen(env.port, () => {
  console.log(`API listening on port ${env.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down.`);

  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
