CREATE TABLE IF NOT EXISTS reader_books (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  byte_size INTEGER NOT NULL,
  page_count INTEGER NOT NULL,
  outline_json TEXT NOT NULL,
  pdf_bytes BLOB NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_opened_at TEXT
);

CREATE INDEX IF NOT EXISTS reader_books_last_opened_idx
  ON reader_books(last_opened_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS reader_pages (
  book_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  page_text TEXT NOT NULL,
  PRIMARY KEY (book_id, page_number),
  FOREIGN KEY (book_id) REFERENCES reader_books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reader_states (
  book_id TEXT PRIMARY KEY,
  current_page INTEGER NOT NULL DEFAULT 1,
  scroll_top REAL NOT NULL DEFAULT 0,
  zoom REAL NOT NULL DEFAULT 1,
  spoiler_boundary_page INTEGER NOT NULL DEFAULT 1,
  stopping_note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (book_id) REFERENCES reader_books(id) ON DELETE CASCADE
);
