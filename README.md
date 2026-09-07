# Mneme

A local PDF reader with a contextual companion. Keep the book in view, ask about difficult passages, and return to the same place with your questions and notes intact.

The desktop reader supersedes the original generated-lesson interface while preserving its database tables. The companion is a plain chat backed by a local Codex runtime.

## Run locally

```bash
bun install --frozen-lockfile
bun run dev
```

Open [Mneme](http://127.0.0.1:5173). The API binds to loopback on port 8787. The default SQLite database is `mneme.sqlite`; set `MNEME_DB_PATH` to choose another location. Keep that database private: it contains imported PDFs, extracted text and reading history.

Import a text-based PDF (up to 25 MiB / 2,000 pages), check its title/author, and save it to your library. Select text or enable region capture for a formula. Page numbers refer to physical PDF pages, which may differ from printed numbers. The chat can search the active book for cross-references and knows your current reading position. Left/right arrows and Page Up/Page Down navigate when you are not editing a field.

## Chat runtime

The plain chat uses a local Codex App Server process and your existing ChatGPT login. Install the current Codex CLI or desktop app, then run `codex login` if needed. Mneme prefers the current desktop app's bundled binary when available; set `MNEME_CODEX_BIN` to override the executable and `MNEME_CODEX_MODEL` to override the configured model.

Codex maintains one resumable conversation per book. Mneme keeps the exact page, scroll position and editable book memory locally. The model can check your position, search extracted PDF text and read bounded passages from the active book. Search covers the book for cross-references; the model is instructed to avoid unsolicited spoilers beyond your reading position. It cannot receive the entire PDF through these tools.

ChatGPT authentication consumes the account's Codex allowance. No API key is needed for this path. Runtime/login failures are shown explicitly. Codex's optional automatic memories are separate from the app's explicit note and are not needed to restore reading position.

DeepSeek can later run through Codex's custom provider configuration using its Responses-compatible endpoint and its own API key. The prior direct DeepSeek/OpenAI endpoints are retained for compatibility but do not drive the new chat UI. Never commit credentials, private PDF databases or runtime session data.

## Development

```bash
bun run typecheck
bun run build
bun run lint
bun run security:check
bun test
bun run test:e2e
bun run db:migrate
```

`bun run db:studio` remains an explicit deferred placeholder. Browser checks use an isolated local database and synthetic original PDF material. Never commit copyrighted book files or private reading history. Legacy source attribution is recorded in [docs/SOURCES.md](docs/SOURCES.md).

See [product scope](docs/SPEC.md), [API contract](docs/API_CONTRACT.md), [verification contract](docs/TEST_CONTRACT.md), and [handoff](docs/HANDOFF.md). EPUB, scanned-PDF OCR, flashcards, grading, accounts and cloud deployment are outside the initial reader scope.
