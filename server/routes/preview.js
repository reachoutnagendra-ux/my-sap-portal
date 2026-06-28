'use strict';

const express = require('express');
const router = express.Router();
const { fetchPreview } = require('../services/previewFetcher');

// GET /api/preview?url=<url>
router.get('/', async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url query param required' });
    try {
      // Validate URL shape early.
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    const meta = await fetchPreview(url);
    res.json(meta);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
