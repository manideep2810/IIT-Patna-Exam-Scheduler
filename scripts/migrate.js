import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and set a value.');
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, '../database/migrations');
const pool = new Pool({ connectionString: databaseUrl });

async function runMigrations() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const migrationFiles = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const filename of migrationFiles) {
      const alreadyApplied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [filename]
      );

      if (alreadyApplied.rowCount > 0) {
        continue;
      }

      const migrationSql = await readFile(path.join(migrationsDirectory, filename), 'utf8');
      await client.query(migrationSql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      console.log(`Applied ${filename}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

try {
  await runMigrations();
} finally {
  await pool.end();
}
