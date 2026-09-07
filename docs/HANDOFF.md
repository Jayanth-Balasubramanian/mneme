# Handoff

## Active product

Mneme is now a desktop PDF reader with an attached contextual companion. The book stays primary; the companion helps with explanations, definitions, missing steps, bounded orientation and returning to a saved position. This supersedes the generated-lesson product direction. See `docs/SPEC.md` and `AGENTS.md` for the current contract.

Implementation branch: `codex/pdf-reading-companion`. Issue [#14](https://github.com/Jayanth-Balasubramanian/mneme/issues/14), PR [#15](https://github.com/Jayanth-Balasubramanian/mneme/pull/15). Do not merge into main without user direction. GitHub remains the only issue queue.

## Structure and continuity

- `src/app/reader/`: PDF.js rendering/selection and desktop reader UI.
- `src/shared/reader.ts`, `src/shared/companion.ts`: serializable contracts and validation.
- `src/domain/readerContext.ts`: bounded local retrieval/history policy.
- `src/server/api/reader.ts`, `companion.ts`: local reader and provider workflows.
- `src/server/ai/companion.ts`: demo, DeepSeek and optional OpenAI adapters.
- `src/server/db/reader.ts`, `conversations.ts`: private PDF, reading state and history persistence.
- Migrations 0004–0007 are additive; the old lesson API/data and attribution are retained.

Run `bun install --frozen-lockfile` then `bun run dev`. Default UI/API ports are 5173/8787; override with WEB_PORT/API_PORT. Default storage is ignored local `mneme.sqlite`. Credentials are server-side environment variables or an ignored `.env`; see README. Do not print credentials or copy local user data into tests, logs or PR artifacts.

The user's Axler PDF is loaded only into private local storage. Public evidence uses original synthetic notes. DeepSeek text smoke testing succeeded on synthetic notes; this does not establish accuracy for Axler or validate experimental vision performance.

## Known limits

Text PDFs only; no OCR, EPUB, cloud deployment, accounts, grading or scheduling. Page references are physical PDF pages, not printed labels. Local lexical retrieval is intentionally simple and can miss definitions. Model prior knowledge can still introduce spoilers despite bounded supplied context. Structured citations validate provenance, not truth. DeepSeek region interpretation uses an experimental vision model. The legacy frontend source remains for compatibility/history but the reader is the application entry point.

See `docs/LOOP_LOG.md` for current verification evidence and review findings. Parent owns orchestration/review/docs; implementation uses a single gpt-5.6-luna xhigh subagent at a time per user routing.

## Current follow-up: Codex chat

The user approved replacing the companion dashboard and custom context orchestration with a plain chat backed by local Codex App Server. Mneme owns the PDF and exact position, explicit Memory note, scoped book tools, and a durable book-to-thread mapping. Codex owns conversation context and agent execution. Existing records and old endpoints remain compatible.

The Homebrew CLI 0.146.0 could initialize but rejected the configured newer model. The desktop-bundled runtime 0.153.4 succeeded for a synthetic tool call and a fresh-process thread resume. Prefer the current bundled binary or set MNEME_CODEX_BIN. DeepSeek documents native Codex/Responses compatibility for future custom-provider configuration using its own credentials; this delivery uses ChatGPT authentication.

The implemented browser flow was verified directly with a fresh synthetic PDF: import, current-position lookup, literal book search, evidence-backed response, and native conversation resume across a server restart all succeeded. The default local library and its Axler PDF remain private and were not used for automated model calls.
