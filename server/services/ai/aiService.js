'use strict';

/**
 * Provider-agnostic AI service.
 *
 * The active adapter is chosen via the AI_ADAPTER env var (noop|openai|anthropic|ollama).
 * Callers depend only on this interface — swap the adapter without touching them.
 *
 *   aiService.summarise(url, content)   -> { summary, tags[] }
 *   aiService.detectType(url, content)  -> { type, confidence }
 *   aiService.suggestTiles(feedSource)  -> { tiles[] }
 *   aiService.rankSuggestions(tiles[])  -> { tiles[] }   // by relevance
 */

const ADAPTERS = {
  noop: () => require('./adapters/noop'),
  openai: () => require('./adapters/openai'),
  anthropic: () => require('./adapters/anthropic'),
  ollama: () => require('./adapters/ollama'),
};

function loadAdapter() {
  const name = (process.env.AI_ADAPTER || 'noop').toLowerCase();
  const factory = ADAPTERS[name] || ADAPTERS.noop;
  try {
    return factory();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[ai] adapter "${name}" failed to load, falling back to noop:`, err.message);
    return ADAPTERS.noop();
  }
}

// Lazily resolved so env vars are read at call time.
let _adapter = null;
function adapter() {
  if (!_adapter) _adapter = loadAdapter();
  return _adapter;
}

module.exports = {
  get name() {
    return (process.env.AI_ADAPTER || 'noop').toLowerCase();
  },
  summarise: (url, content) => adapter().summarise(url, content),
  detectType: (url, content) => adapter().detectType(url, content),
  suggestTiles: (feedSource) => adapter().suggestTiles(feedSource),
  rankSuggestions: (tiles) => adapter().rankSuggestions(tiles),
  // Test/runtime hook to force a re-resolve (e.g. after changing AI_ADAPTER).
  _reset: () => {
    _adapter = null;
  },
};
