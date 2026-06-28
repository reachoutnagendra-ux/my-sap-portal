'use strict';

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query, withTransaction } = require('./db');

const PAGES = [
  {
    name: 'ABAP',
    icon: 'sap-icon://syntax',
    tiles: [
      {
        title: 'ABAP Keyword Documentation',
        subtitle: 'help.sap.com',
        description: 'Official ABAP language reference and keyword documentation.',
        url: 'https://help.sap.com/doc/abapdocu_latest_index_htm/latest/en-US/index.htm',
        type: 'sap-help',
      },
      {
        title: 'Clean ABAP',
        subtitle: 'github.com/SAP',
        description: 'A style guide for clean ABAP code, curated by SAP.',
        url: 'https://github.com/SAP/styleguides',
        type: 'github',
      },
    ],
  },
  {
    name: 'BTP',
    icon: 'sap-icon://cloud',
    tiles: [
      {
        title: 'SAP BTP Documentation',
        subtitle: 'help.sap.com',
        description: 'Business Technology Platform documentation hub.',
        url: 'https://help.sap.com/docs/btp',
        type: 'sap-help',
      },
      {
        title: 'SAP Community Blogs',
        subtitle: 'community.sap.com',
        description: 'Latest blog posts from the SAP developer community.',
        url: 'https://community.sap.com/t5/technology-blogs-by-sap/bg-p/technology-blog-sap',
        type: 'sap-blog',
      },
    ],
  },
  {
    name: 'Learning',
    icon: 'sap-icon://learning-assistant',
    tiles: [
      {
        title: 'SAP Learning Hub',
        subtitle: 'learning.sap.com',
        description: 'Curated learning journeys and certifications.',
        url: 'https://learning.sap.com/',
        type: 'learning-hub',
      },
    ],
  },
  {
    name: 'YouTube',
    icon: 'sap-icon://video',
    tiles: [
      {
        title: 'SAP Developers',
        subtitle: 'youtube.com',
        description: 'Official SAP Developers YouTube channel.',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        type: 'youtube',
      },
    ],
  },
];

async function seed() {
  await withTransaction(async (client) => {
    const { rows: existing } = await client.query('SELECT COUNT(*)::int AS n FROM pages');
    if (existing[0].n > 0) {
      console.log('↳ pages already present — skipping page/tile seed');
    } else {
      let pagePos = 0;
      for (const page of PAGES) {
        const { rows } = await client.query(
          'INSERT INTO pages (name, icon, position) VALUES ($1, $2, $3) RETURNING id',
          [page.name, page.icon, pagePos++]
        );
        const pageId = rows[0].id;
        let tilePos = 0;
        for (const t of page.tiles) {
          await client.query(
            `INSERT INTO tiles (page_id, title, subtitle, description, url, type, position, favicon_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              pageId,
              t.title,
              t.subtitle,
              t.description,
              t.url,
              t.type,
              tilePos++,
              faviconFor(t.url),
            ]
          );
        }
      }
      console.log(`✔ seeded ${PAGES.length} pages with tiles`);
    }

    // Settings: admin PIN hash + defaults
    const pin = process.env.ADMIN_PIN || '1234';
    const hash = await bcrypt.hash(pin, 10);
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('admin_pin_hash', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [hash]
    );
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('site_title', 'My SAP Portal')
       ON CONFLICT (key) DO NOTHING`
    );
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('ai_adapter', $1)
       ON CONFLICT (key) DO NOTHING`,
      [process.env.AI_ADAPTER || 'noop']
    );
    console.log('✔ settings seeded (admin PIN hash set)');
  });
}

function faviconFor(url) {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return null;
  }
}

seed()
  .catch((err) => {
    console.error('✖ seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
