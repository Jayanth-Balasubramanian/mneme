import type { Database } from "bun:sqlite";

import type {
  CompanionConversation,
  CompanionMode,
  CompanionProviderName,
} from "../../shared/companion";
import type { ReaderSelection } from "../../shared/reader";

type ConversationRow = {
  id: string;
  book_id: string;
  question: string;
  mode: CompanionMode;
  provider: CompanionProviderName;
  page_number: number | null;
  page_from: number | null;
  page_to: number | null;
  selection_json: string | null;
  answer_text: string | null;
  citations_json: string;
  evidence_pages_json: string;
  max_context_page: number;
  supplementary: number;
  insufficient_context: number;
  status: CompanionConversation["status"];
  error_message: string | null;
  resolved: number;
  kept: number;
  created_at: string;
  updated_at: string;
};

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function mapConversation(row: ConversationRow): CompanionConversation {
  return {
    id: row.id,
    bookId: row.book_id,
    question: row.question,
    mode: row.mode,
    provider: row.provider,
    ...(row.page_number === null ? {} : { pageNumber: row.page_number }),
    ...(row.page_from === null ? {} : { pageFrom: row.page_from }),
    ...(row.page_to === null ? {} : { pageTo: row.page_to }),
    ...(row.selection_json ? { selection: parseJson<ReaderSelection>(row.selection_json, { text: "", pageNumber: row.page_number ?? 1, rectangles: [] }) } : {}),
    ...(row.answer_text === null ? {} : { answer: row.answer_text }),
    citations: parseJson(row.citations_json, []),
    evidencePages: parseJson(row.evidence_pages_json, []),
    maxContextPage: row.max_context_page,
    supplementary: row.supplementary === 1,
    insufficientContext: row.insufficient_context === 1,
    status: row.status,
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    resolved: row.resolved === 1,
    kept: row.kept === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const selectColumns = `id, book_id, question, mode, provider, page_number, page_from, page_to,
  selection_json, answer_text, citations_json, evidence_pages_json, max_context_page,
  supplementary, insufficient_context, status, error_message, resolved, kept, created_at, updated_at`;

export type NewConversation = Pick<CompanionConversation, "bookId" | "question" | "mode"> & {
  provider?: CompanionProviderName;
  pageNumber?: number;
  pageFrom?: number;
  pageTo?: number;
  selection?: ReaderSelection;
};

export type ConversationAnswer = {
  answer: string;
  citations: Array<{ pageNumber: number; quote?: string }>;
  evidencePages: number[];
  maxContextPage: number;
  supplementary: boolean;
  insufficientContext: boolean;
};

export class SQLiteConversationRepository {
  constructor(private readonly database: Database) {}

  createPending(input: NewConversation): CompanionConversation {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.database.query(`INSERT INTO reader_conversations
      (id, book_id, question, mode, provider, page_number, page_from, page_to, selection_json,
       status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).run(
      id, input.bookId, input.question, input.mode, input.provider ?? "demo",
      input.pageNumber ?? null, input.pageFrom ?? null, input.pageTo ?? null,
      input.selection ? JSON.stringify(input.selection) : null, now, now,
    );
    const created = this.findById(id);
    if (!created) throw new Error("Conversation was not created.");
    return created;
  }

  findById(id: string): CompanionConversation | undefined {
    const row = this.database.query<ConversationRow, [string]>(`SELECT ${selectColumns} FROM reader_conversations WHERE id = ?`).get(id);
    return row ? mapConversation(row) : undefined;
  }

  listByBookId(bookId: string): CompanionConversation[] {
    return this.database.query<ConversationRow, [string]>(`SELECT ${selectColumns} FROM reader_conversations WHERE book_id = ? ORDER BY created_at ASC`).all(bookId).map(mapConversation);
  }

  answer(id: string, result: ConversationAnswer): CompanionConversation | undefined {
    const now = new Date().toISOString();
    this.database.query(`UPDATE reader_conversations SET answer_text = ?, citations_json = ?, evidence_pages_json = ?, max_context_page = ?, supplementary = ?, insufficient_context = ?, status = 'answered', error_message = NULL, updated_at = ? WHERE id = ?`).run(
      result.answer, JSON.stringify(result.citations), JSON.stringify(result.evidencePages), result.maxContextPage, result.supplementary ? 1 : 0, result.insufficientContext ? 1 : 0, now, id,
    );
    return this.findById(id);
  }

  fail(id: string, message: string): CompanionConversation | undefined {
    const now = new Date().toISOString();
    this.database.query("UPDATE reader_conversations SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?").run(message.slice(0, 500), now, id);
    return this.findById(id);
  }

  setResolved(id: string, resolved: boolean): CompanionConversation | undefined {
    this.database.query("UPDATE reader_conversations SET resolved = ?, updated_at = ? WHERE id = ?").run(resolved ? 1 : 0, new Date().toISOString(), id);
    return this.findById(id);
  }

  setKept(id: string, kept: boolean): CompanionConversation | undefined {
    this.database.query("UPDATE reader_conversations SET kept = ?, updated_at = ? WHERE id = ?").run(kept ? 1 : 0, new Date().toISOString(), id);
    return this.findById(id);
  }
}

export type ConversationRepository = SQLiteConversationRepository;
