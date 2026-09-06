import type { Database } from "bun:sqlite";

import type {
  ReaderBook,
  ReaderBookSummary,
  ReaderImportMetadata,
  ReaderOutlineItem,
  ReaderPageText,
  ReaderState,
  ReaderStateUpdate,
} from "../../shared/reader";

type ReaderBookRow = {
  id: string;
  content_hash: string;
  original_filename: string;
  title: string;
  author: string | null;
  byte_size: number;
  page_count: number;
  outline_json: string;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
};

type ReaderPageRow = {
  book_id: string;
  page_number: number;
  page_text: string;
};

type ReaderStateRow = {
  book_id: string;
  current_page: number;
  scroll_top: number;
  zoom: number;
  spoiler_boundary_page: number;
  stopping_note: string;
  revision: number;
  updated_at: string;
};

export type ReaderBookImport = ReaderImportMetadata & {
  bytes: Uint8Array;
};

export class ReaderStateConflictError extends Error {
  constructor() {
    super("Reader state changed elsewhere. Reload the book before saving again.");
    this.name = "ReaderStateConflictError";
  }
}

function parseOutline(json: string): ReaderOutlineItem[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as ReaderOutlineItem[]) : [];
  } catch {
    return [];
  }
}

function mapSummary(row: ReaderBookRow): ReaderBookSummary {
  return {
    id: row.id,
    contentHash: row.content_hash,
    originalFilename: row.original_filename,
    title: row.title,
    author: row.author ?? undefined,
    byteSize: row.byte_size,
    pageCount: row.page_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at ?? undefined,
  };
}

function mapState(row: ReaderStateRow): ReaderState {
  return {
    bookId: row.book_id,
    currentPage: row.current_page,
    scrollTop: row.scroll_top,
    zoom: row.zoom,
    spoilerBoundaryPage: row.spoiler_boundary_page,
    stoppingNote: row.stopping_note,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

export class SQLiteReaderRepository {
  constructor(private readonly database: Database) {}

  listBooks(): ReaderBookSummary[] {
    const rows = this.database
      .query<ReaderBookRow, []>(
        `SELECT id, content_hash, original_filename, title, author, byte_size,
                page_count, outline_json, created_at, updated_at, last_opened_at
           FROM reader_books
          ORDER BY COALESCE(last_opened_at, created_at) DESC, title COLLATE NOCASE ASC`,
      )
      .all();
    return rows.map(mapSummary);
  }

  findById(id: string): ReaderBook | undefined {
    const row = this.database
      .query<ReaderBookRow, [string]>(
        `SELECT id, content_hash, original_filename, title, author, byte_size,
                page_count, outline_json, created_at, updated_at, last_opened_at
           FROM reader_books WHERE id = ?`,
      )
      .get(id);
    if (!row) return undefined;
    const state = this.getState(id);
    if (!state) return undefined;
    return { ...mapSummary(row), outline: parseOutline(row.outline_json), state };
  }

  findSummaryById(id: string): ReaderBookSummary | undefined {
    const row = this.database
      .query<ReaderBookRow, [string]>(
        `SELECT id, content_hash, original_filename, title, author, byte_size,
                page_count, outline_json, created_at, updated_at, last_opened_at
           FROM reader_books WHERE id = ?`,
      )
      .get(id);
    return row ? mapSummary(row) : undefined;
  }

  findByHash(contentHash: string): ReaderBook | undefined {
    const row = this.database
      .query<ReaderBookRow, [string]>(
        `SELECT id, content_hash, original_filename, title, author, byte_size,
                page_count, outline_json, created_at, updated_at, last_opened_at
           FROM reader_books WHERE content_hash = ?`,
      )
      .get(contentHash);
    return row ? this.findById(row.id) : undefined;
  }

  create(input: ReaderBookImport, contentHash: string): ReaderBook {
    const existing = this.findByHash(contentHash);
    if (existing) return existing;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const insertBook = this.database.query(
      `INSERT INTO reader_books
        (id, content_hash, original_filename, title, author, byte_size, page_count,
         outline_json, pdf_bytes, created_at, updated_at, last_opened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertPage = this.database.query(
      `INSERT INTO reader_pages (book_id, page_number, page_text) VALUES (?, ?, ?)`,
    );
    const insertState = this.database.query(
      `INSERT INTO reader_states
        (book_id, current_page, scroll_top, zoom, spoiler_boundary_page,
         stopping_note, revision, updated_at)
       VALUES (?, 1, 0, 1, 1, '', 0, ?)`,
    );

    this.database.transaction(() => {
      insertBook.run(
        id,
        contentHash,
        input.originalFilename,
        input.title,
        input.author ?? null,
        input.bytes.byteLength,
        input.pageCount,
        JSON.stringify(input.outline ?? []),
        input.bytes,
        now,
        now,
        now,
      );
      for (const page of input.pages) insertPage.run(id, page.pageNumber, page.text);
      insertState.run(id, now);
    })();

    const created = this.findById(id);
    if (!created) throw new Error("Reader book was not created.");
    return created;
  }

  updateOutline(id: string, outline: ReaderOutlineItem[]): ReaderBook | undefined {
    this.database.query("UPDATE reader_books SET outline_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(outline), new Date().toISOString(), id);
    return this.findById(id);
  }

  getPdfBytes(id: string): Uint8Array | undefined {
    const row = this.database
      .query<{ pdf_bytes: Uint8Array | ArrayBuffer }, [string]>(
        "SELECT pdf_bytes FROM reader_books WHERE id = ?",
      )
      .get(id);
    if (!row) return undefined;
    return row.pdf_bytes instanceof Uint8Array
      ? row.pdf_bytes
      : new Uint8Array(row.pdf_bytes);
  }

  getPageText(id: string, pageNumber: number): ReaderPageText | undefined {
    const row = this.database
      .query<ReaderPageRow, [string, number]>(
        "SELECT book_id, page_number, page_text FROM reader_pages WHERE book_id = ? AND page_number = ?",
      )
      .get(id, pageNumber);
    return row ? { bookId: row.book_id, pageNumber: row.page_number, text: row.page_text } : undefined;
  }

  getAllPageText(id: string): ReaderPageText[] {
    return this.database
      .query<ReaderPageRow, [string]>(
        "SELECT book_id, page_number, page_text FROM reader_pages WHERE book_id = ? ORDER BY page_number ASC",
      )
      .all(id)
      .map((row) => ({ bookId: row.book_id, pageNumber: row.page_number, text: row.page_text }));
  }

  getState(id: string): ReaderState | undefined {
    const row = this.database
      .query<ReaderStateRow, [string]>(
        `SELECT book_id, current_page, scroll_top, zoom, spoiler_boundary_page,
                stopping_note, revision, updated_at
           FROM reader_states WHERE book_id = ?`,
      )
      .get(id);
    return row ? mapState(row) : undefined;
  }

  updateState(id: string, update: ReaderStateUpdate): ReaderState | undefined {
    const current = this.getState(id);
    if (!current) return undefined;
    if (update.revision !== undefined && update.revision !== current.revision) {
      throw new ReaderStateConflictError();
    }

    const next = {
      currentPage: update.currentPage ?? current.currentPage,
      scrollTop: update.scrollTop ?? current.scrollTop,
      zoom: update.zoom ?? current.zoom,
      spoilerBoundaryPage: update.spoilerBoundaryPage ?? current.spoilerBoundaryPage,
      stoppingNote: update.stoppingNote ?? current.stoppingNote,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    const result = this.database
      .query(
        `UPDATE reader_states
            SET current_page = ?, scroll_top = ?, zoom = ?,
                spoiler_boundary_page = ?, stopping_note = ?, revision = ?, updated_at = ?
          WHERE book_id = ? AND revision = ?`,
      )
      .run(
        next.currentPage,
        next.scrollTop,
        next.zoom,
        next.spoilerBoundaryPage,
        next.stoppingNote,
        next.revision,
        next.updatedAt,
        id,
        current.revision,
      );
    if (result.changes !== 1) throw new ReaderStateConflictError();
    this.markOpened(id, next.updatedAt);
    return this.getState(id);
  }

  markOpened(id: string, at = new Date().toISOString()): void {
    this.database.query("UPDATE reader_books SET last_opened_at = ? WHERE id = ?").run(at, id);
  }
}

export type ReaderRepository = SQLiteReaderRepository;
