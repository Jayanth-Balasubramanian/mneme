import type { Database } from "bun:sqlite";

type Migration = {
  id: string;
  sql: string;
};

const migrations: Migration[] = [
  {
    id: "0001_chapter_sources",
    sql: `
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
    `,
  },
  {
    id: "0002_generation_units",
    sql: `
      CREATE TABLE IF NOT EXISTS generation_runs (
        id TEXT PRIMARY KEY,
        chapter_source_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT,
        prompt_version TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('succeeded', 'failed')),
        input_summary TEXT NOT NULL,
        raw_output_json TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (chapter_source_id) REFERENCES chapter_sources(id)
      );

      CREATE INDEX IF NOT EXISTS generation_runs_chapter_source_id_idx
        ON generation_runs(chapter_source_id);

      CREATE TABLE IF NOT EXISTS lesson_units (
        id TEXT PRIMARY KEY,
        chapter_source_id TEXT NOT NULL,
        generation_run_id TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        title TEXT NOT NULL,
        learning_objective TEXT NOT NULL,
        concept_keys_json TEXT NOT NULL,
        source_anchors_json TEXT NOT NULL,
        explanation_md TEXT NOT NULL,
        intuition_md TEXT NOT NULL,
        notation_md TEXT,
        example_md TEXT,
        misconception_md TEXT,
        review_status TEXT NOT NULL CHECK(
          review_status IN ('draft', 'approved', 'rejected', 'needs_regeneration')
        ),
        reviewer_notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (chapter_source_id) REFERENCES chapter_sources(id),
        FOREIGN KEY (generation_run_id) REFERENCES generation_runs(id)
      );

      CREATE INDEX IF NOT EXISTS lesson_units_chapter_source_id_idx
        ON lesson_units(chapter_source_id);

      CREATE INDEX IF NOT EXISTS lesson_units_generation_run_id_idx
        ON lesson_units(generation_run_id);

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        lesson_unit_id TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        prompt_md TEXT NOT NULL,
        expected_answer_md TEXT NOT NULL,
        rubric_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (lesson_unit_id) REFERENCES lesson_units(id)
      );

      CREATE INDEX IF NOT EXISTS checkpoints_lesson_unit_id_idx
        ON checkpoints(lesson_unit_id);
    `,
  },
  {
    id: "0003_study_attempts",
    sql: `
      CREATE TABLE IF NOT EXISTS study_attempts (
        id TEXT PRIMARY KEY,
        checkpoint_id TEXT NOT NULL,
        lesson_unit_id TEXT NOT NULL,
        answer_md TEXT NOT NULL,
        self_rating TEXT NOT NULL CHECK(self_rating IN ('wrong', 'partial', 'correct')),
        confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
        concept_keys_json TEXT NOT NULL,
        source_anchors_json TEXT NOT NULL,
        attempted_at TEXT NOT NULL,
        FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id),
        FOREIGN KEY (lesson_unit_id) REFERENCES lesson_units(id)
      );

      CREATE TABLE IF NOT EXISTS concept_events (
        id TEXT PRIMARY KEY,
        lesson_unit_id TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        concept_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (lesson_unit_id) REFERENCES lesson_units(id),
        FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id)
      );

      CREATE INDEX IF NOT EXISTS study_attempts_checkpoint_id_idx
        ON study_attempts(checkpoint_id);
      CREATE INDEX IF NOT EXISTS study_attempts_lesson_unit_id_idx
        ON study_attempts(lesson_unit_id);
      CREATE INDEX IF NOT EXISTS concept_events_lesson_unit_id_idx
        ON concept_events(lesson_unit_id);
      CREATE INDEX IF NOT EXISTS concept_events_checkpoint_id_idx
        ON concept_events(checkpoint_id);
      CREATE INDEX IF NOT EXISTS concept_events_chapter_source_idx
        ON concept_events(concept_key, lesson_unit_id);
    `,
  },
  {
    id: "0004_reader",
    sql: `
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
    `,
  },
  {
    id: "0005_companion_conversations",
    sql: `
      CREATE TABLE IF NOT EXISTS reader_conversations (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        question TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('explain', 'define', 'missing-step', 'orient')),
        provider TEXT NOT NULL CHECK(provider IN ('demo', 'openai', 'deepseek')),
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (book_id) REFERENCES reader_books(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS reader_conversations_book_idx
        ON reader_conversations(book_id, created_at DESC);
    `,
  },
  {
    id: "0006_conversation_kept",
    sql: `
      ALTER TABLE reader_conversations
      ADD COLUMN kept INTEGER NOT NULL DEFAULT 0;
    `,
  },
  {
    id: "0007_conversation_deepseek_provider",
    sql: `
      PRAGMA foreign_keys = OFF;
      CREATE TABLE reader_conversations_new (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        question TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('explain', 'define', 'missing-step', 'orient')),
        provider TEXT NOT NULL CHECK(provider IN ('demo', 'openai', 'deepseek')),
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
      PRAGMA foreign_keys = ON;
    `,
  },
];

type MigrationRow = {
  id: string;
};

export function migrateDatabase(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const findMigration = database.query<MigrationRow, [string]>(
    "SELECT id FROM schema_migrations WHERE id = ?",
  );
  const recordMigration = database.query<undefined, [string, string]>(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
  );

  for (const migration of migrations) {
    if (findMigration.get(migration.id)) {
      continue;
    }

    database.exec(migration.sql);
    recordMigration.run(migration.id, new Date().toISOString());
  }
}
