'use strict';

const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth } = require('../auth');

// GET /api/export — full DB as JSON (public-safe: excludes settings/secrets)
router.get('/export', requireAuth, async (req, res, next) => {
  try {
    const [pages, tiles, feeds] = await Promise.all([
      query('SELECT * FROM pages ORDER BY position ASC, id ASC'),
      query('SELECT * FROM tiles ORDER BY page_id, position ASC, id ASC'),
      query('SELECT * FROM feed_sources ORDER BY id ASC'),
    ]);
    res.json({
      version: 2,
      exportedAt: new Date().toISOString(),
      pages: pages.rows,
      tiles: tiles.rows,
      feed_sources: feeds.rows,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/import — { mode: 'merge'|'replace', pages, tiles, feed_sources }
router.post('/import', requireAuth, async (req, res, next) => {
  try {
    const data = req.body || {};
    const mode = data.mode === 'replace' ? 'replace' : 'merge';
    const pages = Array.isArray(data.pages) ? data.pages : [];
    const tiles = Array.isArray(data.tiles) ? data.tiles : [];

    const summary = await withTransaction(async (client) => {
      if (mode === 'replace') {
        await client.query('DELETE FROM tiles');
        await client.query('DELETE FROM pages');
      }

      // Map old page ids -> new page ids so tiles relink correctly.
      const pageIdMap = new Map();
      for (const p of pages) {
        const { rows } = await client.query(
          'INSERT INTO pages (name, icon, position) VALUES ($1,$2,$3) RETURNING id',
          [p.name, p.icon || null, p.position || 0]
        );
        if (p.id != null) pageIdMap.set(p.id, rows[0].id);
      }

      let tileCount = 0;
      for (const t of tiles) {
        const newPageId = pageIdMap.get(t.page_id) || t.page_id;
        if (!newPageId) continue;
        await client.query(
          `INSERT INTO tiles
             (page_id, title, subtitle, description, url, image_url, favicon_url, type, position, ai_summary, ai_tags)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            newPageId,
            t.title,
            t.subtitle || null,
            t.description || null,
            t.url,
            t.image_url || null,
            t.favicon_url || null,
            t.type || 'other',
            t.position || 0,
            t.ai_summary || null,
            t.ai_tags || null,
          ]
        );
        tileCount++;
      }
      return { pages: pageIdMap.size, tiles: tileCount, mode };
    });

    res.json({ ok: true, imported: summary });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
