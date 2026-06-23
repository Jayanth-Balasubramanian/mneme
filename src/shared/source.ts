export type SourceAnchor = {
  headingPath: string[];
  paragraphStart: number;
  paragraphEnd: number;
  sourceUrl: string;
};

export type SourceCredit = {
  title: string;
  authors: string[];
  publisher?: string;
  year?: number;
  chapterTitle: string;
  chapterNumber?: string;
  sourceUrl: string;
  citationText: string;
};

export type SourceContextSnippet = {
  paragraphIndex: number;
  headingPath: string[];
  text: string;
};

export type CreateChapterSourceRequest = {
  bookTitle: string;
  authors: string[];
  publisher?: string;
  year?: number;
  chapterTitle: string;
  chapterNumber?: string;
  sourceUrl: string;
  citationText: string;
  markdown: string;
  emphasisNotes?: string;
};

export type ChapterSourceResponse = {
  id: string;
  bookTitle: string;
  authors: string[];
  publisher?: string;
  year?: number;
  chapterTitle: string;
  chapterNumber?: string;
  sourceUrl: string;
  citationText: string;
  emphasisNotes?: string;
  contentHash: string;
  anchors: SourceAnchor[];
  sourceCredit: SourceCredit;
  createdAt: string;
  updatedAt: string;
};

export type ValidationIssue = {
  field: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(
  input: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): string {
  const value = input[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ field, message: "Required non-empty string." });
    return "";
  }

  return value.trim();
}

function readOptionalString(
  input: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = input[field];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    issues.push({ field, message: "Expected a string." });
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalYear(
  input: Record<string, unknown>,
  issues: ValidationIssue[],
): number | undefined {
  const value = input.year;

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1000 ||
    value > 3000
  ) {
    issues.push({ field: "year", message: "Expected a four-digit year." });
    return undefined;
  }

  return value;
}

function readAuthors(
  input: Record<string, unknown>,
  issues: ValidationIssue[],
): string[] {
  const value = input.authors;

  if (!Array.isArray(value)) {
    issues.push({ field: "authors", message: "Expected at least one author." });
    return [];
  }

  const authors = value
    .filter((author): author is string => typeof author === "string")
    .map((author) => author.trim())
    .filter((author) => author.length > 0);

  if (authors.length === 0 || authors.length !== value.length) {
    issues.push({
      field: "authors",
      message: "Expected at least one non-empty author.",
    });
  }

  return authors;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseCreateChapterSourceRequest(
  payload: unknown,
): ValidationResult<CreateChapterSourceRequest> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(payload)) {
    return {
      ok: false,
      issues: [{ field: "body", message: "Expected a JSON object." }],
    };
  }

  const bookTitle = readRequiredString(payload, "bookTitle", issues);
  const authors = readAuthors(payload, issues);
  const publisher = readOptionalString(payload, "publisher", issues);
  const year = readOptionalYear(payload, issues);
  const chapterTitle = readRequiredString(payload, "chapterTitle", issues);
  const chapterNumber = readOptionalString(payload, "chapterNumber", issues);
  const sourceUrl = readRequiredString(payload, "sourceUrl", issues);
  const citationText = readRequiredString(payload, "citationText", issues);
  const markdown = readRequiredString(payload, "markdown", issues);
  const emphasisNotes = readOptionalString(payload, "emphasisNotes", issues);

  if (sourceUrl.length > 0 && !isValidUrl(sourceUrl)) {
    issues.push({
      field: "sourceUrl",
      message: "Expected an http or https URL.",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      bookTitle,
      authors,
      publisher,
      year,
      chapterTitle,
      chapterNumber,
      sourceUrl,
      citationText,
      markdown,
      emphasisNotes,
    },
  };
}
