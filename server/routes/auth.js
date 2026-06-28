'use strict';

const express = require('express');
const router = express.Router();
const { signToken, verifyPin, changePin, requireAuth } = require('../auth');

// POST /api/auth/login  { pin }  -> { token }
router.post('/login', async (req, res, next) => {
  try {
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'PIN required' });
    const ok = await verifyPin(pin);
    if (!ok) return res.status(401).json({ error: 'Invalid PIN' });
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
