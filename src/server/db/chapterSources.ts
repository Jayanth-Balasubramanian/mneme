import type { Database } from "bun:sqlite";

import { toSourceCredit, type PreparedChapterSource } from "../../domain/source";
import type {
  ChapterSourceResponse,
  SourceAnchor,
  SourceCredit,
} from "../../shared/source";

type ChapterSourceGenerationContext = {
  id: string;
  bookTitle: string;
  chapterTitle: string;
  sourceUrl: string;
  markdown: string;
  anchors: SourceAnchor[];
  sourceCredit: SourceCredit;
};

export type ChapterSourceRepository = {
  create(source: PreparedChapterSource): Promise<ChapterSourceResponse>;
  findById(id: string): Promise<ChapterSourceResponse | null>;
  findGenerationContextById(
    id: string,
  ): Promise<ChapterSourceGenerationContext | null>;
};

type ChapterSourceRow = {
  id: string;
  book_title: string;
  authors_json: string;
  publisher: string | null;
  year: number | null;
  chapter_title: string;
  chapter_number: string | null;
  source_url: string;
  citation_text: string;
  emphasis_notes: string | null;
  content_hash: string;
  anchors_json: string;
  created_at: string;
  updated_at: string;
};

function parseStringArray(json: string): string[] {
  const parsed: unknown = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((value): value is string => typeof value === "string");
}

function parseSourceAnchors(json: string): SourceAnchor[] {
  const parsed: unknown = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((value): value is SourceAnchor => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return false;
    }

    const anchor = value as Partial<SourceAnchor>;

    return (
      Array.isArray(anchor.headingPath) &&
      anchor.headingPath.every((part) => typeof part === "string") &&
      typeof anchor.paragraphStart === "number" &&
      typeof anchor.paragraphEnd === "number" &&
      typeof anchor.sourceUrl === "string"
    );
  });
}

function mapChapterSourceRow(row: ChapterSourceRow): ChapterSourceResponse {
  const authors = parseStringArray(row.authors_json);
  const response = {
    id: row.id,
    bookTitle: row.book_title,
    authors,
    publisher: row.publisher ?? undefined,
    year: row.year ?? undefined,
    chapterTitle: row.chapter_title,
    chapterNumber: row.chapter_number ?? undefined,
    sourceUrl: row.source_url,
    citationText: row.citation_text,
    emphasisNotes: row.emphasis_notes ?? undefined,
    contentHash: row.content_hash,
    anchors: parseSourceAnchors(row.anchors_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return {
    ...response,
    sourceCredit: toSourceCredit(response),
  };
}

export class SQLiteChapterSourceRepository implements ChapterSourceRepository {
  constructor(private readonly database: Database) {}

  async create(source: PreparedChapterSource): Promise<ChapterSourceResponse> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.database
      .query<
        undefined,
        [
          string,
          string,
          string,
          string | null,
          number | null,
          string,
          string | null,
          string,
          string,
          string | null,
          string,
          string,
          string,
          string,
          string,
        ]
      >(
        `
          INSERT INTO chapter_sources (
            id,
            book_title,
            authors_json,
            publisher,
            year,
            chapter_title,
            chapter_number,
            source_url,
            citation_text,
            emphasis_notes,
            markdown,
            content_hash,
            anchors_json,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        id,
        source.bookTitle,
        JSON.stringify(source.authors),
        source.publisher ?? null,
        source.year ?? null,
        source.chapterTitle,
        source.chapterNumber ?? null,
        source.sourceUrl,
        source.citationText,
        source.emphasisNotes ?? null,
        source.markdown,
        source.contentHash,
        JSON.stringify(source.anchors),
        now,
        now,
      );

    const created = await this.findById(id);

    if (!created) {
      throw new Error("Chapter source was not readable after insert.");
    }

    return created;
  }

  async findById(id: string): Promise<ChapterSourceResponse | null> {
    const row = this.database
      .query<ChapterSourceRow, [string]>(
        `
          SELECT
            id,
            book_title,
            authors_json,
            publisher,
            year,
            chapter_title,
            chapter_number,
            source_url,
            citation_text,
            emphasis_notes,
            content_hash,
            anchors_json,
            created_at,
            updated_at
          FROM chapter_sources
          WHERE id = ?
        `,
      )
      .get(id);

    return row ? mapChapterSourceRow(row) : null;
  }

  async findGenerationContextById(
    id: string,
  ): Promise<ChapterSourceGenerationContext | null> {
    const row = this.database
      .query<
        {
          id: string;
          markdown: string;
          book_title: string;
          chapter_title: string;
          source_url: string;
          anchors_json: string;
          authors_json: string;
          publisher: string | null;
          year: number | null;
          chapter_number: string | null;
          citation_text: string;
        },
        [string]
      >(
        `
          SELECT
            id,
            markdown,
            book_title,
            chapter_title,
            source_url,
            anchors_json,
            authors_json,
            publisher,
            year,
            chapter_number,
            citation_text
          FROM chapter_sources
          WHERE id = ?
        `,
      )
      .get(id);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      bookTitle: row.book_title,
      chapterTitle: row.chapter_title,
      sourceUrl: row.source_url,
      markdown: row.markdown,
      anchors: parseSourceAnchors(row.anchors_json),
      sourceCredit: {
        title: row.book_title,
        authors: parseStringArray(row.authors_json),
        publisher: row.publisher ?? undefined,
        year: row.year ?? undefined,
        chapterTitle: row.chapter_title,
        chapterNumber: row.chapter_number ?? undefined,
        sourceUrl: row.source_url,
        citationText: row.citation_text,
      },
    };
  }
}
