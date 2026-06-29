'use strict';

const express = require('express');
const dns = require('node:dns').promises;
const net = require('node:net');
const router = express.Router();
const { fetchPreview } = require('../services/previewFetcher');

function isPrivateIp(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    if (a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }

  if (net.isIPv6(address)) {
    const ip = address.toLowerCase();
    if (ip === '::1') return true;
    if (ip.startsWith('fe80:')) return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
    if (ip.startsWith('::ffff:127.')) return true;
    return false;
  }

  return true;
}

async function isBlockedTarget(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.local')) return true;

  if (net.isIP(host)) return isPrivateIp(host);

  try {
    const resolved = await dns.lookup(host, { all: true, verbatim: true });
    if (!resolved.length) return true;
    return resolved.some((entry) => isPrivateIp(entry.address));
  } catch {
    // Fail closed on DNS errors to avoid blind SSRF probes.
    return true;
  }
}

// GET /api/preview?url=<url>
router.get('/', async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url query param required' });
    let parsed;
    try {
      // Validate URL shape early.
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Only http/https URLs are allowed' });
    }
    if (await isBlockedTarget(parsed.hostname)) {
      return res.status(400).json({ error: 'Target host is not allowed' });
    }
    const meta = await fetchPreview(url);
    res.json(meta);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
