PRAGMA foreign_keys = OFF;

CREATE TABLE reader_conversations_new (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  question TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('explain', 'define', 'missing-step', 'orient')),
  provider TEXT NOT NULL CHECK(provider IN ('demo', 'openai', 'deepseek', 'codex')),
  page_number INTEGER,
  page_from INTEGER,
  page_to INTEGER,
  selection_json TEXT,
  answer_text TEXT,
  citations_json TEXT NOT NULL DEFAULT '[]',
  evidence_pages_json TEXT NOT NULL DEFAULT '[]',
  max_context_page INTEGER NOT NULL DEFAULT 0,
  supplementary INTEGER NOT NULL DEFAULT 0,
  insufficient_context INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('pending', 'answered', 'failed')),
  error_message TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  kept INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (book_id) REFERENCES reader_books(id) ON DELETE CASCADE
);

INSERT INTO reader_conversations_new
  (id, book_id, question, mode, provider, page_number, page_from, page_to,
   selection_json, answer_text, citations_json, evidence_pages_json, max_context_page,
   supplementary, insufficient_context, status, error_message, resolved, kept,
   created_at, updated_at)
  SELECT id, book_id, question, mode, provider, page_number, page_from, page_to,
    selection_json, answer_text, citations_json, evidence_pages_json, max_context_page,
    supplementary, insufficient_context, status, error_message, resolved, kept,
    created_at, updated_at
  FROM reader_conversations;

DROP TABLE reader_conversations;
ALTER TABLE reader_conversations_new RENAME TO reader_conversations;
CREATE INDEX IF NOT EXISTS reader_conversations_book_idx
  ON reader_conversations(book_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reader_codex_threads (
  book_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (book_id) REFERENCES reader_books(id) ON DELETE CASCADE
);

PRAGMA foreign_keys = ON;
