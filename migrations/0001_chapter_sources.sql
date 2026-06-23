CREATE TABLE IF NOT EXISTS chapter_sources (
  id TEXT PRIMARY KEY,
  book_title TEXT NOT NULL,
  authors_json TEXT NOT NULL,
  publisher TEXT,
  year INTEGER,
  chapter_title TEXT NOT NULL,
  chapter_number TEXT,
  source_url TEXT NOT NULL,
  citation_text TEXT NOT NULL,
  emphasis_notes TEXT,
  markdown TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  anchors_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS chapter_sources_content_hash_idx
  ON chapter_sources(content_hash);
