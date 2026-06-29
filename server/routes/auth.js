'use strict';

const express = require('express');
const router = express.Router();
const { signToken, verifyPin, changePin, requireAuth } = require('../auth');

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

function attemptsFor(ip) {
  const now = Date.now();
  const state = loginAttempts.get(ip) || { count: 0, resetAt: now + ATTEMPT_WINDOW_MS };
  if (now >= state.resetAt) {
    const fresh = { count: 0, resetAt: now + ATTEMPT_WINDOW_MS };
    loginAttempts.set(ip, fresh);
    return fresh;
  }
  loginAttempts.set(ip, state);
  return state;
}

// POST /api/auth/login  { pin }  -> { token }
router.post('/login', async (req, res, next) => {
  try {
    const ip = req.ip || 'unknown';
    const state = attemptsFor(ip);
    if (state.count >= MAX_ATTEMPTS) {
      const retryAfter = Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }

    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'PIN required' });
    const ok = await verifyPin(pin);
    if (!ok) {
      state.count += 1;
      return res.status(401).json({ error: 'Invalid PIN' });
    }
    loginAttempts.delete(ip);
    res.json({ token: signToken() });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-pin  { currentPin, newPin }  (auth required)
router.post('/change-pin', requireAuth, async (req, res, next) => {
  try {
    const { currentPin, newPin } = req.body || {};
    if (!newPin || String(newPin).length < 4) {
      return res.status(400).json({ error: 'New PIN must be at least 4 characters' });
    }
    const ok = await verifyPin(currentPin);
    if (!ok) return res.status(401).json({ error: 'Current PIN is incorrect' });
    await changePin(newPin);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
