'use strict';

const cron = require('node-cron');
const { query } = require('./db');
const { scrapeFeedSource } = require('./services/feedScraper');

// Map frequency -> cron expression.
const SCHEDULES = {
  daily: '0 6 * * *', // 06:00 every day
  weekly: '0 6 * * 1', // 06:00 every Monday
};

const tasks = [];

async function runDueFeeds(frequency) {
  try {
    const { rows } = await query(
      'SELECT * FROM feed_sources WHERE enabled = TRUE AND frequency = $1',
      [frequency]
    );
    for (const source of rows) {
      try {
        const n = await scrapeFeedSource(source);
        // eslint-disable-next-line no-console
        console.log(`[scheduler] scraped "${source.name}" → ${n} suggestion(s)`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[scheduler] feed "${source.name}" failed:`, err.message);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[scheduler] could not load feed sources:', err.message);
  }
}

function startScheduler() {
  for (const [frequency, expr] of Object.entries(SCHEDULES)) {
    const task = cron.schedule(expr, () => runDueFeeds(frequency));
    tasks.push(task);
  }
  // eslint-disable-next-line no-console
  console.log('[scheduler] feed scrape jobs registered (daily, weekly)');
}

function stopScheduler() {
  tasks.forEach((t) => t.stop());
}

module.exports = { startScheduler, stopScheduler, runDueFeeds };
