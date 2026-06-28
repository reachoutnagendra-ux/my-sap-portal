'use strict';

/**
 * No-op AI adapter — the safe default.
 *
 * Requires no API key and never makes a network call. Returns empty/neutral
 * results so the rest of the app behaves as if AI is simply turned off.
 */

module.exports = {
  async summarise() {
    return { summary: null, tags: [] };
  },

  async detectType() {
    return { type: 'other', confidence: 0 };
  },

  async suggestTiles() {
    return { tiles: [] };
  },

  async rankSuggestions(tiles) {
    return { tiles: tiles || [] };
  },
};
