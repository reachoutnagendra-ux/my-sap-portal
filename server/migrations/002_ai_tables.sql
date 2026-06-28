-- Feed Sources (for AI scraper)
CREATE TABLE IF NOT EXISTS feed_sources (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT CHECK (type IN (
                 'youtube-channel','sap-blog-tag',
                 'github-topic','rss'
               )) NOT NULL,
  identifier   TEXT NOT NULL,     -- channel ID, tag slug, topic, RSS URL
  target_page  INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  enabled      BOOLEAN DEFAULT TRUE,
  frequency    TEXT CHECK (frequency IN ('daily','weekly')) DEFAULT 'weekly',
  last_scraped TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- AI-proposed tiles awaiting approval
CREATE TABLE IF NOT EXISTS suggestions (
  id           SERIAL PRIMARY KEY,
  feed_source_id INTEGER REFERENCES feed_sources(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  subtitle     TEXT,
  description  TEXT,
  url          TEXT NOT NULL,
  image_url    TEXT,
  type         TEXT DEFAULT 'other',
  ai_summary   TEXT,
  ai_tags      TEXT[],
  status       TEXT CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
