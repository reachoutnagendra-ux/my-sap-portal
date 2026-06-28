-- Track the original publish date of a scraped item so the inbox can sort by it.
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_suggestions_published_at ON suggestions(published_at DESC);
