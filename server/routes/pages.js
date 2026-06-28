'use strict';

const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { requireAuth } = require('../auth');

// GET /api/pages — list all pages with tile counts
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT p.*, COALESCE(t.cnt, 0)::int AS tile_count
      FROM pages p
      LEFT JOIN (SELECT page_id, COUNT(*) AS cnt FROM tiles GROUP BY page_id) t
        ON t.page_id = p.id
      ORDER BY p.position ASC, p.id ASC
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/pages — create a page
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { name, icon } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const { rows } = await query(
      `INSERT INTO pages (name, icon, position)
       VALUES ($1, $2, COALESCE((SELECT MAX(position) + 1 FROM pages), 0))
       RETURNING *`,
      [name, icon || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/pages/:id — update page
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const { name, icon } = req.body || {};
    const { rows } = await query(
      `UPDATE pages SET
         name = COALESCE($1, name),
         icon = COALESCE($2, icon)
       WHERE id = $3 RETURNING *`,
      [name ?? null, icon ?? null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Page not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/pages/:id — delete page and its tiles (cascade)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM pages WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Page not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/pages/reorder — batch reorder  { order: [id, id, ...] }
router.post('/reorder', requireAuth, async (req, res, next) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
    await withTransaction(async (client) => {
      for (let i = 0; i < order.length; i++) {
        await client.query('UPDATE pages SET position = $1 WHERE id = $2', [i, order[i]]);
      }
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
