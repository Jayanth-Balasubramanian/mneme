import { bodyLimit } from "hono/body-limit";
import type { Context, Hono } from "hono";

import {
  parseReaderImportMetadata,
  parseReaderStateUpdate,
  READER_MAX_PDF_BYTES,
  validatePdfHeader,
  validateReaderStateUpdate,
} from "../../shared/reader";
import type { ReaderImportMetadata } from "../../shared/reader";
import type { ReaderBookImport, SQLiteReaderRepository } from "../db/reader";
import { ReaderStateConflictError } from "../db/reader";
import { validatePdfWithPdfJs } from "./readerPdfValidation";

const READER_MULTIPART_BODY_LIMIT = READER_MAX_PDF_BYTES + 8 * 1024 * 1024 + 1_048_576;
const READER_STATE_BODY_LIMIT = 64 * 1024;

export type ReaderPdfValidator = (bytes: Uint8Array) => Promise<{ pageCount: number }>;

type ReaderRouteDependencies = {
  getReaderRepository: () => SQLiteReaderRepository;
  validatePdf?: ReaderPdfValidator;
};

function localOriginAllowed(context: Context): boolean {
  const origin = context.req.header("origin");
  let requestUrl: URL;
  try {
    requestUrl = new URL(context.req.url);
  } catch {
    return false;
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const normalizeHostname = (hostname: string) => hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const requestHostname = normalizeHostname(requestUrl.hostname);
  if (!localHosts.has(requestHostname)) return false;
  const hostHeader = context.req.header("host");
  if (hostHeader) {
    try {
      const hostUrl = new URL(`${requestUrl.protocol}//${hostHeader}`);
      if (!localHosts.has(normalizeHostname(hostUrl.hostname))) return false;
    } catch {
      return false;
    }
  }
  if (!origin) return true;
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  if (originUrl.origin === requestUrl.origin) return true;
  return originUrl.protocol === "http:" && requestUrl.protocol === "http:" &&
    localHosts.has(normalizeHostname(originUrl.hostname)) && localHosts.has(requestHostname);
}

export function rejectForeignOrigin(context: Context): Response | undefined {
  return localOriginAllowed(context)
    ? undefined
    : context.json({ error: "forbidden_origin", reason: "mutation_origin_not_allowed" }, 403);
}

function parseBookId(value: string | undefined): string | undefined {
  return value && /^[0-9a-f-]{16,64}$/i.test(value) ? value : undefined;
}

function parsePageNumber(value: string | undefined): number | undefined {
  if (!value || !/^[0-9]+$/.test(value)) return undefined;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : undefined;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer as ArrayBuffer);
  return `sha256:${Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function jsonMetadataFromForm(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function parseImportRequest(context: Context): Promise<
  | { ok: true; file: File; metadata: ReaderImportMetadata }
  | { ok: false; response: Response }
> {
  let body: Record<string, unknown>;
  try {
    body = await context.req.parseBody();
  } catch {
    return { ok: false, response: context.json({ error: "invalid_multipart", issues: [{ field: "body", message: "Expected multipart form data." }] }, 400) };
  }
  const fileValue = body.file;
  if (!(fileValue instanceof File)) {
    return { ok: false, response: context.json({ error: "validation_failed", issues: [{ field: "file", message: "Expected a PDF file." }] }, 400) };
  }
  const metadataValue = jsonMetadataFromForm(body.metadata);
  const parsed = parseReaderImportMetadata(metadataValue);
  if (!parsed.ok) return { ok: false, response: context.json({ error: "validation_failed", issues: parsed.issues }, 400) };
  return { ok: true, file: fileValue, metadata: parsed.value };
}

export function registerReaderRoutes(app: Hono, dependencies: ReaderRouteDependencies): void {
  app.get("/api/reader/books", (context) => context.json({ books: dependencies.getReaderRepository().listBooks() }));

  app.get("/api/reader/books/:bookId", (context) => {
    const id = parseBookId(context.req.param("bookId"));
    if (!id) return context.json({ error: "invalid_book_id" }, 400);
    const repository = dependencies.getReaderRepository();
    const book = repository.findById(id);
    if (!book) return context.json({ error: "book_not_found" }, 404);
    repository.markOpened(id);
    return context.json({ ...book, lastOpenedAt: new Date().toISOString() });
  });

  app.get("/api/reader/books/:bookId/pdf", (context) => {
    const id = parseBookId(context.req.param("bookId"));
    if (!id) return context.json({ error: "invalid_book_id" }, 400);
    const bytes = dependencies.getReaderRepository().getPdfBytes(id);
    if (!bytes) return context.json({ error: "book_not_found" }, 404);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": "inline",
        "Cache-Control": "no-store",
      },
    });
  });

  app.get("/api/reader/books/:bookId/state", (context) => {
    const id = parseBookId(context.req.param("bookId"));
    if (!id) return context.json({ error: "invalid_book_id" }, 400);
    const state = dependencies.getReaderRepository().getState(id);
    return state ? context.json(state) : context.json({ error: "book_not_found" }, 404);
  });

  app.get("/api/reader/books/:bookId/pages/:pageNumber", (context) => {
    const id = parseBookId(context.req.param("bookId"));
    const pageNumber = parsePageNumber(context.req.param("pageNumber"));
    if (!id || pageNumber === undefined || pageNumber < 1) return context.json({ error: "invalid_page" }, 400);
    const page = dependencies.getReaderRepository().getPageText(id, pageNumber);
    return page ? context.json(page) : context.json({ error: "page_not_found" }, 404);
  });

  app.post(
    "/api/reader/books/import",
    bodyLimit({ maxSize: READER_MULTIPART_BODY_LIMIT, onError: (context: Context) => context.json({ error: "pdf_too_large" }, 413) }),
    async (context) => {
      const forbidden = rejectForeignOrigin(context);
      if (forbidden) return forbidden;
      const parsedRequest = await parseImportRequest(context);
      if (!parsedRequest.ok) return parsedRequest.response;
      const { file, metadata } = parsedRequest;
      if (file.size < 5 || file.size > READER_MAX_PDF_BYTES) {
        return context.json({ error: "validation_failed", issues: [{ field: "file", message: `PDF must be between 5 bytes and ${READER_MAX_PDF_BYTES} bytes.` }] }, 400);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!validatePdfHeader(bytes)) {
        return context.json({ error: "invalid_pdf", reason: "missing_pdf_header" }, 400);
      }
      const actualHash = await sha256(bytes);
      if (metadata.contentHash && metadata.contentHash !== actualHash) {
        return context.json({ error: "invalid_pdf", reason: "content_hash_mismatch" }, 400);
      }
      try {
        const validatePdf = dependencies.validatePdf ?? validatePdfWithPdfJs;
        const validated = await validatePdf(bytes);
        if (validated.pageCount !== metadata.pageCount) {
          return context.json({ error: "invalid_pdf_metadata", reason: "page_count_mismatch" }, 400);
        }
      } catch (error) {
        const reason = error instanceof Error && /password/i.test(error.name + error.message)
          ? "password_protected"
          : "malformed_pdf";
        return context.json({ error: "invalid_pdf", reason }, 400);
      }
      const repository = dependencies.getReaderRepository();
      const existing = repository.findByHash(actualHash);
      if (existing) {
        repository.markOpened(existing.id);
        const refreshed = metadata.outline.length > 0
          ? repository.updateOutline(existing.id, metadata.outline)
          : existing;
        return context.json(refreshed ?? existing, 200);
      }
      const imported: ReaderBookImport = { ...metadata, bytes, contentHash: actualHash };
      try {
        const created = repository.create(imported, actualHash);
        return context.json(created, 201);
      } catch (error) {
        console.error(error);
        return context.json({ error: "book_import_failed" }, 500);
      }
    },
  );

  app.patch(
    "/api/reader/books/:bookId/state",
    bodyLimit({ maxSize: READER_STATE_BODY_LIMIT, onError: (context: Context) => context.json({ error: "state_too_large" }, 413) }),
    async (context) => {
    const forbidden = rejectForeignOrigin(context);
    if (forbidden) return forbidden;
    const id = parseBookId(context.req.param("bookId"));
    if (!id) return context.json({ error: "invalid_book_id" }, 400);
    let payload: unknown;
    try { payload = await context.req.json(); } catch { return context.json({ error: "invalid_json" }, 400); }
    const parsed = parseReaderStateUpdate(payload);
    if (!parsed.ok) return context.json({ error: "validation_failed", issues: parsed.issues }, 400);
    const repository = dependencies.getReaderRepository();
    const book = repository.findSummaryById(id);
    if (!book) return context.json({ error: "book_not_found" }, 404);
    const issues = validateReaderStateUpdate(parsed.value, book.pageCount);
    if (issues.length > 0) return context.json({ error: "validation_failed", issues }, 400);
    try {
      const state = repository.updateState(id, parsed.value);
      return state ? context.json(state) : context.json({ error: "book_not_found" }, 404);
    } catch (error) {
      if (error instanceof ReaderStateConflictError) return context.json({ error: "state_conflict", reason: error.message }, 409);
      console.error(error);
      return context.json({ error: "state_update_failed" }, 500);
    }
    },
  );
}
