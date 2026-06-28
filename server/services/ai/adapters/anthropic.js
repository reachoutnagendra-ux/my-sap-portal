'use strict';

/**
 * Anthropic (Claude) adapter.
 *
 * Uses the Messages API over plain fetch — no SDK dependency required.
 * Configure with:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   ANTHROPIC_MODEL=claude-sonnet-4-6   (default)
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const VERSION = '2023-06-01';

async function callClaude(prompt, { maxTokens = 512 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Anthropic API ${r.status}: ${body.slice(0, 200)}`);
  }
  const j = await r.json();
  return (j.content || []).map((c) => c.text || '').join('').trim();
}

function safeJson(text, fallback) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : fallback;
  } catch {
    return fallback;
  }
}

module.exports = {
  async summarise(url, content) {
    const text = await callClaude(
      `Summarise the following web page for a developer bookmark in 1-2 sentences, ` +
        `and propose 1-4 short topical tags. URL: ${url}\n\nContent:\n${(content || '').slice(0, 4000)}\n\n` +
        `Respond ONLY with JSON: {"summary": string, "tags": string[]}`
    );
    return safeJson(text, { summary: null, tags: [] });
  },

  async detectType(url, content) {
    const text = await callClaude(
      `Classify this URL into exactly one of: sap-blog, learning-hub, github, youtube, sap-help, other. ` +
        `URL: ${url}\nContent hint: ${(content || '').slice(0, 500)}\n` +
        `Respond ONLY with JSON: {"type": string, "confidence": number}`
    );
    return safeJson(text, { type: 'other', confidence: 0 });
  },

  async suggestTiles(feedSource) {
    const text = await callClaude(
      `Given this feed source, propose up to 5 relevant tiles (recent items) as bookmarks. ` +
        `Feed: ${JSON.stringify(feedSource)}\n` +
        `Respond ONLY with JSON: {"tiles": [{"title": string, "url": string, "description": string, "type": string}]}`,
      { maxTokens: 1024 }
    );
    return safeJson(text, { tiles: [] });
  },

  async rankSuggestions(tiles) {
    if (!tiles || !tiles.length) return { tiles: [] };
    const text = await callClaude(
      `Rank these candidate bookmarks by relevance to an SAP developer, most relevant first. ` +
        `Return the same objects reordered. Items: ${JSON.stringify(tiles).slice(0, 6000)}\n` +
        `Respond ONLY with JSON: {"tiles": [...]}`,
      { maxTokens: 1024 }
    );
    return safeJson(text, { tiles });
  },
};
