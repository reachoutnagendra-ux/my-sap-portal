'use strict';

/**
 * Ollama adapter — fully local/offline LLM.
 * Configure with OLLAMA_BASE_URL (default http://localhost:11434) and OLLAMA_MODEL (default llama3).
 */

const BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'llama3';

async function callOllama(prompt) {
  const r = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false, format: 'json' }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Ollama ${r.status}: ${body.slice(0, 200)}`);
  }
  const j = await r.json();
  return j.response || '';
}

function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    try {
      return m ? JSON.parse(m[0]) : fallback;
    } catch {
      return fallback;
    }
  }
}

module.exports = {
  async summarise(url, content) {
    const text = await callOllama(
      `Summarise this page for a bookmark in 1-2 sentences and give 1-4 tags. URL: ${url}\n` +
        `Content: ${(content || '').slice(0, 4000)}\nReply JSON {"summary":string,"tags":string[]}.`
    );
    return safeJson(text, { summary: null, tags: [] });
  },

  async detectType(url, content) {
    const text = await callOllama(
      `Classify URL into one of sap-blog, learning-hub, github, youtube, sap-help, other. URL: ${url}\n` +
        `Hint: ${(content || '').slice(0, 500)}\nReply JSON {"type":string,"confidence":number}.`
    );
    return safeJson(text, { type: 'other', confidence: 0 });
  },

  async suggestTiles(feedSource) {
    const text = await callOllama(
      `Propose up to 5 bookmark tiles for feed ${JSON.stringify(feedSource)}. ` +
        `Reply JSON {"tiles":[{"title","url","description","type"}]}.`
    );
    return safeJson(text, { tiles: [] });
  },

  async rankSuggestions(tiles) {
    if (!tiles || !tiles.length) return { tiles: [] };
    const text = await callOllama(
      `Rank these bookmarks by relevance to an SAP developer; return reordered. ` +
        `${JSON.stringify(tiles).slice(0, 6000)}\nReply JSON {"tiles":[...]}.`
    );
    return safeJson(text, { tiles });
  },
};
