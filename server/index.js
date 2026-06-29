'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { pool } = require('./db');
const { startScheduler } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // Non-browser clients (curl/postman) often have no Origin header.
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) {
      return cb(new Error('CORS blocked: CORS_ORIGIN is not configured'));
    }
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked: origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};

app.disable('x-powered-by');
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// --- Health check ---
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'down', error: err.message });
  }
});

// --- API routes ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/pages', require('./routes/pages'));
app.use('/api', require('./routes/tiles')); // /api/tiles, /api/pages/:id/tiles, /api/tiles/reorder
app.use('/api/preview', require('./routes/preview'));
app.use('/api/feeds', require('./routes/feeds'));
app.use('/api/suggestions', require('./routes/suggestions'));
app.use('/api', require('./routes/importExport')); // /api/export, /api/import

// --- Static OpenUI5 frontend ---
const WEBAPP = path.join(__dirname, '..', 'webapp');
app.use(express.static(WEBAPP));

// SPA fallback for client-side routes (admin, etc.) — but never for /api.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(WEBAPP, 'index.html'));
});

// --- Central error handler ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error('API error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`SAP Favorites Portal listening on http://localhost:${PORT}`);
    startScheduler();
  });
}

module.exports = app;
