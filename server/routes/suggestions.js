'use strict';

const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth } = require('../auth');

// GET /api/suggestions — list pending suggestions (default), or ?status=all
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    // Newest blog first: sort by the item's own publish date, then by scrape time.
    const order = 'ORDER BY published_at DESC NULLS LAST, created_at DESC';
    const sql =
      status === 'all'
        ? `SELECT * FROM suggestions ${order}`
        : `SELECT * FROM suggestions WHERE status = $1 ${order}`;
    const { rows } = status === 'all' ? await query(sql) : await query(sql, [status]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PUT /api/suggestions/:id/approve — promote to a tile
// Optional body overrides: { page_id, title, subtitle, description, url, image_url, type }
router.put('/:id/approve', requireAuth, async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM suggestions WHERE id = $1', [
        req.params.id,
      ]);
      const s = rows[0];
      if (!s) return { notFound: true };

      const b = req.body || {};
      let pageId = b.page_id;
      if (!pageId) {
        // Resolve the feed source's target page; fall back to first page.
        const fs = await client.query(
          'SELECT target_page FROM feed_sources WHERE id = $1',
          [s.feed_source_id]
        );
        pageId = fs.rows[0] && fs.rows[0].target_page;
        if (!pageId) {
          const p = await client.query('SELECT id FROM pages ORDER BY position ASC LIMIT 1');
          pageId = p.rows[0] && p.rows[0].id;
        }
      }
      if (!pageId) return { noPage: true };

      const { rows: tileRows } = await client.query(
        `INSERT INTO tiles
           (page_id, title, subtitle, description, url, image_url, type, ai_summary, ai_tags, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
           COALESCE((SELECT MAX(position) + 1 FROM tiles WHERE page_id = $1), 0))
         RETURNING *`,
        [
          pageId,
          b.title || s.title,
          b.subtitle || s.subtitle,
          b.description || s.description,
          b.url || s.url,
          b.image_url || s.image_url,
          b.type || s.type || 'other',
          s.ai_summary,
          s.ai_tags,
        ]
      );
      await client.query("UPDATE suggestions SET status = 'approved' WHERE id = $1", [s.id]);
      return { tile: tileRows[0] };
    });

    if (result.notFound) return res.status(404).json({ error: 'Suggestion not found' });
    if (result.noPage) return res.status(400).json({ error: 'No target page available' });
    res.json({ ok: true, tile: result.tile });
  } catch (err) {
    next(err);
  }
});

// PUT /api/suggestions/:id/reject
router.put('/:id/reject', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      "UPDATE suggestions SET status = 'rejected' WHERE id = $1 RETURNING id",
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Suggestion not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
