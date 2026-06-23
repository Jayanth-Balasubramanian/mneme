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
