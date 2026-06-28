'use strict';

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { requireAuth } = require('../auth');
const { scrapeFeedSource } = require('../services/feedScraper');

const FEED_TYPES = ['youtube-channel', 'sap-blog-tag', 'github-topic', 'rss'];

// GET /api/feeds — list feed sources
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM feed_sources ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/feeds — create
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.name || !FEED_TYPES.includes(b.type) || !b.identifier) {
      return res.status(400).json({ error: 'name, valid type and identifier required' });
    }
    const { rows } = await query(
      `INSERT INTO feed_sources (name, type, identifier, target_page, enabled, frequency)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        b.name,
        b.type,
        b.identifier,
        b.target_page || null,
        b.enabled !== false,
        b.frequency === 'daily' ? 'daily' : 'weekly',
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/feeds/:id — update
router.put('/:id', requireAuth, async (req, res, next) => {
  try {
    const b = req.body || {};
    const { rows } = await query(
      `UPDATE feed_sources SET
         name        = COALESCE($1, name),
         type        = COALESCE($2, type),
         identifier  = COALESCE($3, identifier),
         target_page = COALESCE($4, target_page),
         enabled     = COALESCE($5, enabled),
         frequency   = COALESCE($6, frequency)
       WHERE id = $7 RETURNING *`,
      [
        b.name ?? null,
        b.type && FEED_TYPES.includes(b.type) ? b.type : null,
        b.identifier ?? null,
        b.target_page ?? null,
        typeof b.enabled === 'boolean' ? b.enabled : null,
        b.frequency ?? null,
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Feed source not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/feeds/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rowCount } = await query('DELETE FROM feed_sources WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Feed source not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/feeds/:id/scrape — trigger manual scrape now
router.post('/:id/scrape', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM feed_sources WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Feed source not found' });
    const count = await scrapeFeedSource(rows[0]);
    res.json({ ok: true, suggestions: count });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
