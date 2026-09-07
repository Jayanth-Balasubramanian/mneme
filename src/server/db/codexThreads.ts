import type { Database } from "bun:sqlite";

export type CodexThreadRecord = {
  bookId: string;
  threadId: string;
  createdAt: string;
  updatedAt: string;
};

type CodexThreadRow = {
  book_id: string;
  thread_id: string;
  created_at: string;
  updated_at: string;
};

function mapThread(row: CodexThreadRow): CodexThreadRecord {
  return {
    bookId: row.book_id,
    threadId: row.thread_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SQLiteCodexThreadRepository {
  constructor(private readonly database: Database) {}

  findByBookId(bookId: string): CodexThreadRecord | undefined {
    const row = this.database.query<CodexThreadRow, [string]>(
      "SELECT book_id, thread_id, created_at, updated_at FROM reader_codex_threads WHERE book_id = ?",
    ).get(bookId);
    return row ? mapThread(row) : undefined;
  }

  save(bookId: string, threadId: string): CodexThreadRecord {
    const now = new Date().toISOString();
    this.database.query(`
      INSERT INTO reader_codex_threads (book_id, thread_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(book_id) DO UPDATE SET thread_id = excluded.thread_id, updated_at = excluded.updated_at
    `).run(bookId, threadId, now, now);
    const saved = this.findByBookId(bookId);
    if (!saved) throw new Error("Codex thread was not persisted.");
    return saved;
  }
}

