'use strict';

const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth } = require('../auth');
const aiService = require('../services/ai/aiService');

const TYPES = ['sap-blog', 'learning-hub', 'github', 'youtube', 'sap-help', 'other'];

function sanitizeType(type) {
  return TYPES.includes(type) ? type : 'other';
}

// GET /api/tiles — all tiles (for global search)
router.get('/tiles', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT t.*, p.name AS page_name
      FROM tiles t JOIN pages p ON p.id = t.page_id
      ORDER BY t.page_id, t.position ASC, t.id ASC
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/pages/:id/tiles — list tiles for one page
router.get('/pages/:id/tiles', async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT * FROM tiles WHERE page_id = $1 ORDER BY position ASC, id ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/tiles — create a tile
router.post('/tiles', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.page_id || !b.title || !b.url) {
      return res.status(400).json({ error: 'page_id, title and url are required' });
    }
    const { rows } = await query(
      `INSERT INTO tiles
         (page_id, title, subtitle, description, url, image_url, favicon_url, type, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
         COALESCE((SELECT MAX(position) + 1 FROM tiles WHERE page_id = $1), 0))
       RETURNING *`,
      [
        b.page_id,
        b.title,
        b.subtitle || null,
        b.description || null,
        b.url,
        b.image_url || null,
        b.favicon_url || null,
        sanitizeType(b.type),
      ]
    );
    const tile = rows[0];

    // Fire-and-forget AI enrichment (noop by default, safe).
    aiService
      .summarise(tile.url, tile.description || '')
      .then(async (out) => {
        if (out && (out.summary || (out.tags && out.tags.length))) {
          await query('UPDATE tiles SET ai_summary = $1, ai_tags = $2 WHERE id = $3', [
            out.summary || null,
            out.tags || null,
            tile.id,
          ]);
        }
      })
      .catch(() => {});

    res.status(201).json(tile);
  } catch (err) {
    next(err);
  }
});

// PUT /api/tiles/:id — update a tile
router.put('/tiles/:id', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE tiles SET
         page_id     = COALESCE($1, page_id),
         title       = COALESCE($2, title),
         subtitle    = COALESCE($3, subtitle),
         description = COALESCE($4, description),
         url         = COALESCE($5, url),
         image_url   = COALESCE($6, image_url),
         favicon_url = COALESCE($7, favicon_url),
         type        = COALESCE($8, type),
         updated_at  = NOW()
       WHERE id = $9 RETURNING *`,
      [
        b.page_id ?? null,
        b.title ?? null,
        b.subtitle ?? null,
        b.description ?? null,
        b.url ?? null,
        b.image_url ?? null,
        b.favicon_url ?? null,
        b.type ? sanitizeType(b.type) : null,
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tile not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tiles/:id
router.delete('/tiles/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM tiles WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Tile not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/tiles/reorder — { order: [id, id, ...] }  (within a page)
router.post('/tiles/reorder', requireAuth, async (req, res, next) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
    await withTransaction(async (client) => {
      for (let i = 0; i < order.length; i++) {
        await client.query('UPDATE tiles SET position = $1 WHERE id = $2', [i, order[i]]);
      }
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
