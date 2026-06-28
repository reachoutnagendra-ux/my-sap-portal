-- Pages (categories / tabs)
CREATE TABLE IF NOT EXISTS pages (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,                -- SAP icon name or emoji
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Tiles (individual link cards)
CREATE TABLE IF NOT EXISTS tiles (
  id           SERIAL PRIMARY KEY,
  page_id      INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  subtitle     TEXT,
  description  TEXT,
  url          TEXT NOT NULL,
  image_url    TEXT,
  favicon_url  TEXT,
  type         TEXT CHECK (type IN (
                 'sap-blog','learning-hub','github',
                 'youtube','sap-help','other'
               )) DEFAULT 'other',
  position     INTEGER NOT NULL DEFAULT 0,
  ai_summary   TEXT,              -- populated by AI service, nullable
  ai_tags      TEXT[],            -- array of AI-generated tags
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiles_page_id ON tiles(page_id);

-- App settings (admin PIN hash, site title, active AI adapter, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key          TEXT PRIMARY KEY,
  value        TEXT
);
