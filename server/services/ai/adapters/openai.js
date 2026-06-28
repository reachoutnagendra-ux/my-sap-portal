'use strict';

/**
 * OpenAI / Azure OpenAI adapter (Chat Completions over fetch, no SDK).
 * Configure with OPENAI_API_KEY and OPENAI_MODEL (default gpt-4o-mini).
 */

const API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

async function callOpenAI(prompt, { maxTokens = 512 } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`OpenAI API ${r.status}: ${body.slice(0, 200)}`);
  }
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message.content) || '';
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
    const text = await callOpenAI(
      `Summarise this web page for a developer bookmark in 1-2 sentences and propose 1-4 short tags. ` +
        `URL: ${url}\nContent:\n${(content || '').slice(0, 4000)}\n` +
        `Reply as JSON {"summary": string, "tags": string[]}.`
    );
    return safeJson(text, { summary: null, tags: [] });
  },

  async detectType(url, content) {
    const text = await callOpenAI(
      `Classify URL into one of sap-blog, learning-hub, github, youtube, sap-help, other. ` +
        `URL: ${url}\nHint: ${(content || '').slice(0, 500)}\n` +
        `Reply as JSON {"type": string, "confidence": number}.`
    );
    return safeJson(text, { type: 'other', confidence: 0 });
  },

  async suggestTiles(feedSource) {
    const text = await callOpenAI(
      `Propose up to 5 relevant bookmark tiles for this feed source. Feed: ${JSON.stringify(feedSource)}\n` +
        `Reply as JSON {"tiles": [{"title","url","description","type"}]}.`,
      { maxTokens: 1024 }
    );
    return safeJson(text, { tiles: [] });
  },

  async rankSuggestions(tiles) {
    if (!tiles || !tiles.length) return { tiles: [] };
    const text = await callOpenAI(
      `Rank these bookmarks by relevance to an SAP developer, most relevant first; return reordered. ` +
        `Items: ${JSON.stringify(tiles).slice(0, 6000)}\nReply as JSON {"tiles":[...]}.`,
      { maxTokens: 1024 }
    );
    return safeJson(text, { tiles });
  },
};
