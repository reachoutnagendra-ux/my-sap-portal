'use strict';

const cheerio = require('cheerio');
const { query } = require('../db');
const aiService = require('./ai/aiService');
const { detectType, faviconFor, fetchGithubReadmeSummary } = require('./previewFetcher');

const FETCH_TIMEOUT_MS = 8000;

// Only keep feed items published within this many days; newest first.
const WINDOW_DAYS = Number(process.env.FEED_WINDOW_DAYS) || 14;
// Safety cap so a very busy feed can't flood the inbox in one scrape.
const MAX_ITEMS = Number(process.env.FEED_MAX_ITEMS) || 50;

async function timedFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SAPFavoritesPortal/2.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, application/json, text/html;q=0.8',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ---- per-type scrapers: return raw candidate items ---------------------------

async function scrapeRss(identifier) {
  const r = await timedFetch(identifier);
  const xml = await r.text();
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = [];
  $('item, entry').each((_, el) => {
    const node = $(el);
    const title = node.find('title').first().text().trim();
    let link = node.find('link').first().text().trim();
    if (!link) link = node.find('link').first().attr('href') || '';
    const description = node.find('description, summary').first().text().trim();
    // RSS uses <pubDate>; Atom uses <published>/<updated>; some feeds use <date>.
    const dateStr =
      node.find('pubDate').first().text().trim() ||
      node.find('published').first().text().trim() ||
      node.find('updated').first().text().trim() ||
      node.find('date').first().text().trim();
    if (title && link) items.push({ title, url: link, description, published: parseDate(dateStr) });
  });
  return items;
}

async function scrapeYouTubeChannel(channelId) {
  // YouTube exposes a public RSS feed per channel — works without an API key.
  const url = channelId.startsWith('http')
    ? channelId
    : `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  return scrapeRss(url);
}

async function scrapeSapBlogTag(tag) {
  // SAP Community exposes RSS per tag/label.
  const url = tag.startsWith('http')
    ? tag
    : `https://community.sap.com/khhcw49343/rss/board?board.id=${encodeURIComponent(tag)}`;
  try {
    return await scrapeRss(url);
  } catch {
    return [];
  }
}

async function scrapeGithubTopic(topic) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(
    `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(
      topic
    )}&sort=updated&order=desc&per_page=${MAX_ITEMS}`,
    { headers }
  );
  if (!r.ok) return [];
  const j = await r.json();
  const repos = (j.items || []).map((repo) => ({
    title: repo.full_name,
    url: repo.html_url,
    description: repo.description || '',
    owner: repo.owner && repo.owner.login,
    repo: repo.name,
    published: parseDate(repo.pushed_at || repo.updated_at),
  }));
  // For repos with no description, fall back to the README's first paragraph.
  await Promise.all(
    repos
      .filter((it) => !it.description && it.owner && it.repo)
      .map(async (it) => {
        it.description = (await fetchGithubReadmeSummary(it.owner, it.repo)) || '';
      })
  );
  return repos;
}

async function scrapeRaw(source) {
  switch (source.type) {
    case 'youtube-channel':
      return scrapeYouTubeChannel(source.identifier);
    case 'sap-blog-tag':
      return scrapeSapBlogTag(source.identifier);
    case 'github-topic':
      return scrapeGithubTopic(source.identifier);
    case 'rss':
      return scrapeRss(source.identifier);
    default:
      return [];
  }
}

// ---- public: scrape a source, enrich via AI, persist new suggestions ---------

async function scrapeFeedSource(source) {
  const raw = await scrapeRaw(source).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`[feedScraper] ${source.type} fetch failed:`, err.message);
    return [];
  });

  // Keep only items from the last WINDOW_DAYS, newest first.
  const recent = withinWindow(raw);

  // Let the active AI adapter optionally propose/augment & rank. noop returns input untouched.
  let candidates = recent;
  try {
    const ranked = await aiService.rankSuggestions(recent);
    if (ranked && Array.isArray(ranked.tiles) && ranked.tiles.length) {
      candidates = ranked.tiles;
    }
  } catch {
    /* keep raw */
  }

  let inserted = 0;
  for (const item of candidates) {
    if (!item.url || !item.title) continue;

    // Skip URLs already present as a tile or a non-rejected suggestion.
    const dup = await query(
      `SELECT 1 FROM tiles WHERE url = $1
       UNION ALL
       SELECT 1 FROM suggestions WHERE url = $1 AND status <> 'rejected' LIMIT 1`,
      [item.url]
    );
    if (dup.rowCount) continue;

    let aiSummary = null;
    let aiTags = null;
    try {
      const s = await aiService.summarise(item.url, item.description || '');
      aiSummary = s.summary || null;
      aiTags = s.tags && s.tags.length ? s.tags : null;
    } catch {
      /* noop / offline */
    }

    await query(
      `INSERT INTO suggestions
         (feed_source_id, title, subtitle, description, url, image_url, type, ai_summary, ai_tags, published_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`,
      [
        source.id,
        item.title,
        hostnameOf(item.url),
        truncate(item.description, 400),
        item.url,
        item.image_url || null,
        item.type || detectType(item.url),
        aiSummary,
        aiTags,
        item.published instanceof Date ? item.published.toISOString() : null,
      ]
    );
    inserted++;
  }

  await query('UPDATE feed_sources SET last_scraped = NOW() WHERE id = $1', [source.id]);
  return inserted;
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Filter to items published within WINDOW_DAYS and sort newest-first.
// If the feed carries no usable dates at all, fall back to the first MAX_ITEMS
// (feeds are normally newest-first) so the source still works.
function withinWindow(items) {
  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const dated = items.filter((it) => it.published instanceof Date);
  if (!dated.length) {
    return items.slice(0, MAX_ITEMS);
  }
  return dated
    .filter((it) => it.published.getTime() >= cutoff)
    .sort((a, b) => b.published - a.published)
    .slice(0, MAX_ITEMS);
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function truncate(text, n) {
  if (!text) return null;
  const clean = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
}

module.exports = { scrapeFeedSource, faviconFor };
