'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('./db');

const DEFAULT_JWT_SECRET = 'change-me-to-a-long-random-string';
const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const TOKEN_TTL = '12h';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === DEFAULT_JWT_SECRET) {
  throw new Error('JWT_SECRET must be set to a strong random value in production');
}

function signToken(payload = {}) {
  return jwt.sign({ ...payload, role: 'admin' }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function getSetting(key) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0] ? rows[0].value : null;
}

async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

async function getAdminPinHash() {
  let hash = await getSetting('admin_pin_hash');
  if (!hash) {
    // Fall back to env PIN on first run if seed has not been run yet.
    const pin = process.env.ADMIN_PIN || '1234';
    if (process.env.NODE_ENV === 'production' && pin === '1234') {
      throw new Error('ADMIN_PIN must be set to a non-default value in production');
    }
    hash = await bcrypt.hash(pin, 10);
    await setSetting('admin_pin_hash', hash);
  }
  return hash;
}

async function verifyPin(pin) {
  const hash = await getAdminPinHash();
  return bcrypt.compare(String(pin), hash);
}

async function changePin(newPin) {
  const hash = await bcrypt.hash(String(newPin), 10);
  await setSetting('admin_pin_hash', hash);
}

// Express middleware: require a valid admin JWT on write endpoints.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  signToken,
  verifyToken,
  verifyPin,
  changePin,
  getSetting,
  setSetting,
  requireAuth,
};
