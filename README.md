# Mneme

A local PDF reader with a contextual companion. Keep the book in view, ask about difficult passages, and return to the same place with your questions and notes intact.

The desktop reader rework is on `codex/pdf-reading-companion` ([PR #15](https://github.com/Jayanth-Balasubramanian/mneme/pull/15)). It supersedes the original generated-lesson interface while preserving its database tables.

## Run locally

```bash
bun install --frozen-lockfile
bun run dev
```

Open [Mneme](http://127.0.0.1:5173). The API binds to loopback on port 8787. The default SQLite database is `mneme.sqlite`; set `MNEME_DB_PATH` to choose another location. Keep that database private: it contains imported PDFs, extracted text and reading history.

Import a text-based PDF (up to 25 MiB / 2,000 pages), check its title/author, and save it to your library. Select text or enable region capture for a formula. Page numbers refer to physical PDF pages, which may differ from printed numbers. Reading position and the companion's allowed context boundary are separate controls. If a question exceeds that boundary, use the explicit “Allow through page…” action and ask again. Left/right arrows and Page Up/Page Down navigate when you are not editing a field.

## Companion setup

Reading and local document storage require no API key. Demo responses are explicitly labeled and are only for checking the interaction. Real explanations use DeepSeek when configured; OpenAI Responses is also supported. Configure credentials server-side:

```bash
export DEEPSEEK_API_KEY='<your API key>'
export DEEPSEEK_MODEL='deepseek-v4-flash'
bun run dev
```

Do not put keys in browser code, commit them, or paste them into screenshots. A live question sends bounded selected/retrieved text and an optional selected image to the selected provider; it does not upload the complete PDF. The model can still make mistakes. Page citations show where supporting context came from, not a guarantee that the interpretation is correct.

The context boundary limits supplied pages and conversation evidence. Model instructions also prohibit later spoilers, but a model's prior knowledge cannot be completely controlled by retrieval boundaries.

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
