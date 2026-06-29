'use strict';

const express = require('express');
const router = express.Router();
const { getSetting, setSetting, requireAuth } = require('../auth');

const KEYS = {
  name: 'profile_name',
  title: 'profile_title',
  avatar: 'profile_avatar',
};

// Cap the stored avatar so a clone of the app can't be bloated by a huge image.
// ~1.5 MB of base64 ≈ a ~1 MB source image, plenty for an avatar.
const MAX_AVATAR_LENGTH = 1_500_000;

function isValidAvatar(value) {
  if (value === '' || value === null) return true; // clearing the avatar
  return typeof value === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value);
}

// GET /api/profile  -> public; powers the header on the viewer.
router.get('/', async (req, res, next) => {
  try {
    const [name, title, avatar] = await Promise.all([
      getSetting(KEYS.name),
      getSetting(KEYS.title),
      getSetting(KEYS.avatar),
    ]);
    res.json({ name: name || '', title: title || '', avatar: avatar || '' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/profile  { name, title, avatar }  (auth required)
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const { name, title, avatar } = req.body || {};

    if (name !== undefined && String(name).length > 120) {
      return res.status(400).json({ error: 'Name is too long (max 120 chars)' });
    }
    if (title !== undefined && String(title).length > 160) {
      return res.status(400).json({ error: 'Title is too long (max 160 chars)' });
    }
    if (avatar !== undefined) {
      if (!isValidAvatar(avatar)) {
        return res.status(400).json({ error: 'Avatar must be a PNG/JPEG/GIF/WebP data URL' });
      }
      if (typeof avatar === 'string' && avatar.length > MAX_AVATAR_LENGTH) {
        return res.status(413).json({ error: 'Avatar image is too large (max ~1 MB)' });
      }
    }

    const writes = [];
    if (name !== undefined) writes.push(setSetting(KEYS.name, String(name)));
    if (title !== undefined) writes.push(setSetting(KEYS.title, String(title)));
    if (avatar !== undefined) writes.push(setSetting(KEYS.avatar, String(avatar)));
    await Promise.all(writes);

    const [outName, outTitle, outAvatar] = await Promise.all([
      getSetting(KEYS.name),
      getSetting(KEYS.title),
      getSetting(KEYS.avatar),
    ]);
    res.json({ name: outName || '', title: outTitle || '', avatar: outAvatar || '' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
