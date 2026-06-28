'use strict';

const cheerio = require('cheerio');

const FETCH_TIMEOUT_MS = 5000;

// ---- type detection ----------------------------------------------------------

function detectType(url) {
  const u = url.toLowerCase();
  if (/youtube\.com|youtu\.be/.test(u)) return 'youtube';
  if (/github\.com/.test(u)) return 'github';
  if (/learning\.sap\.com/.test(u)) return 'learning-hub';
  if (/help\.sap\.com/.test(u)) return 'sap-help';
  if (/blogs\.sap\.com|community\.sap\.com/.test(u)) return 'sap-blog';
  return 'other';
}

function faviconFor(url) {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return null;
  }
}

// ---- low-level fetch with timeout -------------------------------------------

async function timedFetch(url, extraHeaders) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SAPFavoritesPortal/2.0; +https://localhost)',
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...(extraHeaders || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---- per-source strategies ---------------------------------------------------

function youtubeVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(embed|shorts)\/([^/?]+)/);
    if (m) return m[2];
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchYouTube(url) {
  const id = youtubeVideoId(url);
  const imageUrl = id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
  let title = null;
  let description = null;

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (id && apiKey) {
    try {
      const r = await timedFetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${apiKey}`
      );
      if (r.ok) {
        const j = await r.json();
        const sn = j.items && j.items[0] && j.items[0].snippet;
        if (sn) {
          title = sn.title;
          description = sn.description;
        }
      }
    } catch {
      /* fall through to OG */
    }
  }
  if (!title) {
    const og = await fetchOpenGraph(url).catch(() => ({}));
    title = og.title || title;
    description = description || og.description;
  }
  return {
    title: title || 'YouTube Video',
    subtitle: 'youtube.com',
    description: truncate(description, 400),
    imageUrl,
    faviconUrl: faviconFor(url),
    detectedType: 'youtube',
  };
}

function parseGithubRepo(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
  } catch {
    /* ignore */
  }
  return null;
}

function githubHeaders() {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

// Strip Markdown/HTML/badges from a README and return its first real paragraph.
function readmeToSummary(md) {
  if (!md) return null;
  let text = md
    .replace(/```[\s\S]*?```/g, ' ') // fenced code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images / badges
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> link text
    .replace(/<[^>]+>/g, ' ') // raw HTML tags
    .replace(/^\s{0,3}#{1,6}\s.*$/gm, ' ') // headings
    .replace(/[>*_`|]/g, ' '); // residual markdown symbols
  // First paragraph with enough substance.
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 30);
  return paras.length ? paras[0] : null;
}

// Fetch a repo's README (decoded) and summarise it — used when description is empty.
async function fetchGithubReadmeSummary(owner, repo) {
  try {
    const r = await timedFetch(
      `https://api.github.com/repos/${owner}/${repo}/readme`,
      githubHeaders()
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.content) return null;
    const md = Buffer.from(j.content, j.encoding || 'base64').toString('utf8');
    return readmeToSummary(md);
  } catch {
    return null;
  }
}

async function fetchGitHub(url) {
  const info = parseGithubRepo(url);
  if (!info) return fetchOpenGraph(url);
  try {
    const r = await timedFetch(
      `https://api.github.com/repos/${info.owner}/${info.repo}`,
      githubHeaders()
    );
    if (r.ok) {
      const j = await r.json();
      // Prefer the repo description; fall back to the README's first paragraph.
      let description = j.description;
      if (!description) {
        description = await fetchGithubReadmeSummary(info.owner, info.repo);
      }
      return {
        title: j.full_name || `${info.owner}/${info.repo}`,
        subtitle: 'github.com',
        description: truncate(description, 400),
        imageUrl: `https://opengraph.githubassets.com/1/${info.owner}/${info.repo}`,
        faviconUrl: faviconFor(url),
        detectedType: 'github',
      };
    }
  } catch {
    /* fall through */
  }
  return fetchOpenGraph(url);
}

// ---- generic Open Graph scraping --------------------------------------------

async function fetchOpenGraph(url) {
  const detectedType = detectType(url);
  try {
    const r = await timedFetch(url);
    const html = await r.text();
    const $ = cheerio.load(html);
    const meta = (prop) =>
      $(`meta[property="${prop}"]`).attr('content') ||
      $(`meta[name="${prop}"]`).attr('content') ||
      null;

    const title = meta('og:title') || $('title').first().text().trim() || null;
    const description = meta('og:description') || meta('description') || null;
    const imageUrl = absolutize(meta('og:image'), url);

    return {
      title: title || hostnameOf(url),
      subtitle: hostnameOf(url),
      description: truncate(description, 400),
      imageUrl,
      faviconUrl: faviconFor(url),
      detectedType,
    };
  } catch {
    return {
      title: hostnameOf(url),
      subtitle: hostnameOf(url),
      description: null,
      imageUrl: null,
      faviconUrl: faviconFor(url),
      detectedType,
    };
  }
}

// ---- helpers ----------------------------------------------------------------

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function absolutize(maybeUrl, base) {
  if (!maybeUrl) return null;
  try {
    return new URL(maybeUrl, base).href;
  } catch {
    return maybeUrl;
  }
}

function truncate(text, n) {
  if (!text) return null;
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
}

// ---- public entry point ------------------------------------------------------

async function fetchPreview(url) {
  const type = detectType(url);
  switch (type) {
    case 'youtube':
      return fetchYouTube(url);
    case 'github':
      return fetchGitHub(url);
    default:
      return fetchOpenGraph(url);
  }
}

module.exports = { fetchPreview, detectType, faviconFor, fetchGithubReadmeSummary };
