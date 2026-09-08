# Architecture

Mneme is a local, desktop-first PDF reader with a book-scoped chat companion. The browser renders the original PDF; a loopback Bun server owns persistence and the Codex process. There is no account, cloud service, or deployment layer.

## Runtime

`bun run dev` starts Vite on port 5173 and Hono on port 8787. Vite proxies `/api` to Hono. The server opens `mneme.sqlite` by default and starts Codex App Server over stdio on the first chat request. `MNEME_DB_PATH`, `MNEME_CODEX_BIN`, and `MNEME_CODEX_MODEL` override those defaults.

The current product path is:

1. `ReaderApp` parses a local PDF with PDF.js, then uploads its bytes, page text, outline, and metadata.
2. Hono validates the document and stores it with reading state in SQLite.
3. `PdfViewer` renders one physical page and reports navigation, zoom, text selections, and captured regions.
4. A question enters the companion API with the active page and optional selection.
5. `CodexChatService` resumes the book's Codex thread and exposes three book-scoped tools: `get_reader_position`, `search_book`, and `read_pages`.
6. The answer and evidence pages are persisted. The client renders inert Markdown and KaTeX.

## Modules

- `src/app/reader/`: React reader, PDF.js adapter, viewer, chat, and Markdown rendering.
- `src/server/api/`: Hono routes, request limits, validation, and loopback-origin checks.
- `src/server/ai/`: Codex stdio client and book-tool adapter. Legacy direct providers remain isolated here.
- `src/server/db/`: SQLite migrations and repositories. This is the only layer that accesses the database directly.
- `src/domain/`: runtime-neutral retrieval and retained legacy workflow rules.
- `src/shared/`: serializable contracts and validation shared by browser and server.

Keep dependencies pointed inward: `app` and `server` may use `domain` and `shared`; `domain` and `shared` must not import UI, persistence, provider SDKs, or Bun/Node APIs.

## Persistence

The database stores PDF bytes, extracted page text, outline, reading position, explicit book memory, chat records, and the Codex thread ID. Book identity is the SHA-256 hash of the PDF bytes. Page references are one-based physical PDF pages. Migrations are additive because tables from the earlier lesson-generation prototype remain readable, although they do not drive the current UI.

## Trust boundaries

PDFs, extracted text, questions, credentials, and the SQLite database are private local data. Never commit them. Reader and companion routes accept loopback requests only, validate bounded bodies, and use parameterized SQL. Codex tools are bound to the active book and accept page numbers or literal search text, never filesystem paths or shell commands. A model turn receives bounded excerpts rather than the PDF or a full chapter. Markdown rendering does not enable raw HTML or MDX; PDF scripts and attachments are not executed.

## Extension points

`CodexChatService` is the companion seam. Alternative models can be configured through Codex or implemented behind the provider layer without changing reader state or persistence. Add EPUB, OCR, synchronization, or inferred learner state only as separate adapters and schemas; none is part of the current reader contract.
