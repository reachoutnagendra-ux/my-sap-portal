'use strict';

// Generates docs/data.json + copies webapp/ into docs/ for a static GitHub Pages viewer.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, query } = require('./db');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const WEBAPP = path.join(ROOT, 'webapp');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function run() {
  const [pages, tiles] = await Promise.all([
    query('SELECT * FROM pages ORDER BY position ASC, id ASC'),
    query('SELECT * FROM tiles ORDER BY page_id, position ASC, id ASC'),
  ]);

  fs.mkdirSync(DOCS, { recursive: true });
  copyDir(WEBAPP, DOCS);

  const data = {
    version: 2,
    static: true,
    exportedAt: new Date().toISOString(),
    pages: pages.rows,
    tiles: tiles.rows,
  };
  fs.writeFileSync(path.join(DOCS, 'data.json'), JSON.stringify(data, null, 2));
  console.log(`✔ exported ${pages.rows.length} pages / ${tiles.rows.length} tiles to docs/`);
  console.log('  Static viewer reads data.json directly; admin UI is disabled in this mode.');
}

run()
  .catch((err) => {
    console.error('✖ export failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
