/**
 * Runtime-neutral contracts for the local PDF reader.
 *
 * Browser and server adapters deliberately use the same physical page and
 * normalized coordinate vocabulary so selections remain meaningful at any
 * zoom level.
 */

export const READER_MAX_PDF_BYTES = 25 * 1024 * 1024;
export const READER_MAX_PDF_PAGES = 2_000;
export const READER_MAX_EXTRACTED_TEXT_BYTES = 8 * 1024 * 1024;
export const READER_MIN_ZOOM = 0.5;
export const READER_MAX_ZOOM = 3;

export type ValidationIssue = {
  field: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export type ReaderBookSummary = {
  id: string;
  contentHash: string;
  originalFilename: string;
  title: string;
  author?: string;
  byteSize: number;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
};

export type ReaderBook = ReaderBookSummary & {
  outline: ReaderOutlineItem[];
  state: ReaderState;
};

export type ReaderPageText = {
  bookId: string;
  pageNumber: number;
  text: string;
};

export type ReaderOutlineItem = {
  title: string;
  pageNumber?: number;
  children: ReaderOutlineItem[];
};

export type ReaderState = {
  bookId: string;
  currentPage: number;
  scrollTop: number;
  zoom: number;
  spoilerBoundaryPage: number;
  stoppingNote: string;
  revision: number;
  updatedAt: string;
};

export type ReaderStateUpdate = {
  currentPage?: number;
  scrollTop?: number;
  zoom?: number;
  spoilerBoundaryPage?: number;
  stoppingNote?: string;
  /** If supplied, the update is applied only to this state revision. */
  revision?: number;
};

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ReaderSelection = {
  text: string;
  pageNumber: number;
  rectangles: NormalizedRect[];
  regionImageDataUrl?: string;
};

export type ReaderImportMetadata = {
  originalFilename: string;
  title: string;
  author?: string;
  pageCount: number;
  pages: Array<{ pageNumber: number; text: string }>;
  outline: ReaderOutlineItem[];
  contentHash?: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  payload: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
  maxLength: number,
): string {
  const value = payload[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ field, message: "Expected a non-empty string." });
    return "";
  }
  if (value.trim().length > maxLength) {
    issues.push({ field, message: `Expected at most ${maxLength} characters.` });
  }
  return value.trim();
}

function optionalString(
  payload: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
  maxLength: number,
): string | undefined {
  const value = payload[field];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    issues.push({ field, message: "Expected a string when provided." });
    return undefined;
  }
  if (value.trim().length > maxLength) {
    issues.push({ field, message: `Expected at most ${maxLength} characters.` });
  }
  return value.trim() || undefined;
}

function validPageNumber(value: unknown, pageCount: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= pageCount
  );
}

function parseOutline(
  value: unknown,
  pageCount: number,
  field: string,
  issues: ValidationIssue[],
  depth = 0,
): ReaderOutlineItem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issues.push({ field, message: "Expected an outline array." });
    return [];
  }
  if (depth > 20 || value.length > 10_000) {
    issues.push({ field, message: "Outline is too deep or contains too many entries." });
    return [];
  }
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) {
      issues.push({ field: `${field}[${index}]`, message: "Expected an outline object." });
      return [];
    }
    const title = entry.title;
    if (typeof title !== "string" || title.trim().length === 0 || title.length > 500) {
      issues.push({ field: `${field}[${index}].title`, message: "Expected a non-empty title up to 500 characters." });
      return [];
    }
    const pageNumber = entry.pageNumber;
    if (pageNumber !== undefined && !validPageNumber(pageNumber, pageCount)) {
      issues.push({ field: `${field}[${index}].pageNumber`, message: "Expected a valid physical page number." });
      return [];
    }
    return [{
      title: title.trim(),
      ...(pageNumber === undefined ? {} : { pageNumber }),
      children: parseOutline(entry.children, pageCount, `${field}[${index}].children`, issues, depth + 1),
    }];
  });
}

export function parseReaderImportMetadata(
  payload: unknown,
): ValidationResult<ReaderImportMetadata> {
  if (!isRecord(payload)) {
    return { ok: false, issues: [{ field: "body", message: "Expected a JSON object." }] };
  }
  const issues: ValidationIssue[] = [];
  const originalFilename = requiredString(payload, "originalFilename", issues, 255);
  const title = requiredString(payload, "title", issues, 240);
  const author = optionalString(payload, "author", issues, 240);
  const pageCountValue = payload.pageCount;
  const pageCount = typeof pageCountValue === "number" ? pageCountValue : 0;
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > READER_MAX_PDF_PAGES) {
    issues.push({ field: "pageCount", message: `Expected an integer from 1 to ${READER_MAX_PDF_PAGES}.` });
  }
  const pagesValue = payload.pages;
  const pages: Array<{ pageNumber: number; text: string }> = [];
  let extractedTextBytes = 0;
  if (!Array.isArray(pagesValue)) {
    issues.push({ field: "pages", message: "Expected page text entries." });
  } else if (pagesValue.length !== pageCount) {
    issues.push({ field: "pages", message: "Expected one extracted text entry for every page." });
  } else {
    for (const [index, entry] of pagesValue.entries()) {
      if (!isRecord(entry) || entry.pageNumber !== index + 1 || typeof entry.text !== "string") {
        issues.push({ field: `pages[${index}]`, message: "Expected ordered pageNumber and text." });
        continue;
      }
      if (entry.text.length > 5_000_000) {
        issues.push({ field: `pages[${index}].text`, message: "Extracted page text is too large." });
        continue;
      }
      extractedTextBytes += new TextEncoder().encode(entry.text).byteLength;
      if (extractedTextBytes > READER_MAX_EXTRACTED_TEXT_BYTES) {
        issues.push({ field: "pages", message: `Extracted text must be at most ${READER_MAX_EXTRACTED_TEXT_BYTES} bytes in total.` });
        break;
      }
      pages.push({ pageNumber: index + 1, text: entry.text });
    }
  }
  const parsedOutline = parseOutline(payload.outline, pageCount, "outline", issues);
  const contentHash = optionalString(payload, "contentHash", issues, 80);
  if (contentHash !== undefined && !/^sha256:[a-f0-9]{64}$/.test(contentHash)) {
    issues.push({ field: "contentHash", message: "Expected a sha256 hash." });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { originalFilename, title, author, pageCount, pages, outline: parsedOutline, contentHash } };
}

export function parseReaderStateUpdate(payload: unknown): ValidationResult<ReaderStateUpdate> {
  if (!isRecord(payload)) return { ok: false, issues: [{ field: "body", message: "Expected a JSON object." }] };
  const issues: ValidationIssue[] = [];
  const result: ReaderStateUpdate = {};
  for (const field of ["currentPage", "spoilerBoundaryPage", "revision"] as const) {
    const value = payload[field];
    if (value !== undefined) {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) issues.push({ field, message: "Expected a non-negative integer." });
      else result[field] = value;
    }
  }
  for (const field of ["scrollTop", "zoom"] as const) {
    const value = payload[field];
    if (value !== undefined) {
      if (typeof value !== "number" || !Number.isFinite(value)) issues.push({ field, message: "Expected a finite number." });
      else result[field] = value;
    }
  }
  const stoppingNote = payload.stoppingNote;
  if (stoppingNote !== undefined) {
    if (typeof stoppingNote !== "string" || stoppingNote.length > 10_000) issues.push({ field: "stoppingNote", message: "Expected text up to 10,000 characters." });
    else result.stoppingNote = stoppingNote;
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: result };
}

export function validateReaderStateUpdate(
  update: ReaderStateUpdate,
  pageCount: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (update.currentPage !== undefined && !validPageNumber(update.currentPage, pageCount)) {
    issues.push({ field: "currentPage", message: "Expected a valid physical page number." });
  }
  if (update.spoilerBoundaryPage !== undefined && !validPageNumber(update.spoilerBoundaryPage, pageCount)) {
    issues.push({ field: "spoilerBoundaryPage", message: "Expected a valid spoiler boundary page." });
  }
  if (update.scrollTop !== undefined && (update.scrollTop < 0 || update.scrollTop > 1)) {
    issues.push({ field: "scrollTop", message: "Expected a normalized value from 0 to 1." });
  }
  if (update.zoom !== undefined && (update.zoom < READER_MIN_ZOOM || update.zoom > READER_MAX_ZOOM)) {
    issues.push({ field: "zoom", message: `Expected a zoom from ${READER_MIN_ZOOM} to ${READER_MAX_ZOOM}.` });
  }
  return issues;
}

export function validatePdfHeader(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}

export function normalizedRectFromClientRect(
  rect: { left: number; top: number; right: number; bottom: number },
  pageRect: { left: number; top: number; width: number; height: number },
): NormalizedRect {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  const x = clamp((rect.left - pageRect.left) / pageRect.width);
  const y = clamp((rect.top - pageRect.top) / pageRect.height);
  const right = clamp((rect.right - pageRect.left) / pageRect.width);
  const bottom = clamp((rect.bottom - pageRect.top) / pageRect.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
