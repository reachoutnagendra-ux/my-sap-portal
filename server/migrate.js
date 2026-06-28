'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, query } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function appliedMigrations() {
  const { rows } = await query('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

async function run() {
  await ensureMigrationsTable();
  const done = await appliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (done.has(file)) {
      console.log(`↳ skip   ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`↳ apply  ${file}`);
    await query('BEGIN');
    try {
      await query(sql);
      await query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await query('COMMIT');
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }
  }
  console.log('✔ migrations complete');
}

run()
  .catch((err) => {
    console.error('✖ migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
