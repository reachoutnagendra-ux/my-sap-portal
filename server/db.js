'use strict';

const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://favorites:favorites@localhost:5432/favorites';

// Enable SSL automatically for managed cloud Postgres (Azure/Railway/Render/Supabase)
const ssl =
  process.env.PGSSL === 'true' || /\bsslmode=require\b/.test(connectionString)
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({ connectionString, ssl });

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PG pool error', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
