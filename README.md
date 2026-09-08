# Mneme

A local PDF reader with a book-scoped Codex companion. It preserves your position and notes, explains selected passages, and can search the active book for definitions or cross-references.

## Run

Requires Bun and a Codex CLI or desktop installation authenticated with ChatGPT.

```bash
bun install --frozen-lockfile
bun run dev
```

Open <http://127.0.0.1:5173>. The API listens on `127.0.0.1:8787`. Imported PDFs, extracted text, reading state, and chats live in the ignored `mneme.sqlite`; set `MNEME_DB_PATH` to use another database. Set `MNEME_CODEX_BIN` or `MNEME_CODEX_MODEL` to override the detected Codex runtime or model.

Text PDFs are supported up to 25 MiB and 2,000 pages. The reader supports outlines, keyboard navigation, zoom, text/region attachments, persistent position, and book memory. Companion answers render Markdown and LaTeX through React Markdown and KaTeX.

## Develop

```bash
bun run typecheck
bun run lint
bun run security:check
bun test
bun run build
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries and data flow.
