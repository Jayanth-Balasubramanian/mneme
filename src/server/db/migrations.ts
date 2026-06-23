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
