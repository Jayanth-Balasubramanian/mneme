# Verification contract

The desktop PDF reader is the active browser workflow. Keep legacy unit/integration coverage for retained source, generation, review and study APIs while verifying the new reader independently with original synthetic material.

## Commands

- `bun run typecheck`: shared/server/browser TypeScript boundaries.
- `bun run lint`: code hygiene.
- `bun run build`: production Vite bundle and local PDF.js worker.
- `bun run security:check`: public-repository secret/content policy and application security regression checks.
- `bun test`: domain/schema, provider adapter and isolated SQLite integration tests.
- `bun run test:e2e`: isolated Chrome and SQLite browser flow. Set `CHROME_BIN` when Chrome is not installed at a known location.
- `MNEME_DB_PATH=/tmp/mneme-check.sqlite bun run db:migrate`: additive migration smoke test using a disposable database.

## Reader checks

Validate malformed/oversized PDFs, metadata and page bounds, duplicate byte identity, original-byte retrieval, outline mapping and revision conflicts. Verify page/scroll/zoom/note/context-boundary persistence. Navigation must not change the allowed context boundary. PDF rendering, text selection and region capture need real browser checks, including selection after zoom, outline navigation and keyboard behavior outside editing controls.

## Companion checks

Verify context size limits, physical-page provenance, selection anchors, same-book retrieval, earlier definition lookup, explicit orientation ranges, and exclusion of later source/history. Invalid provider output and out-of-context citations must not become successful answers. Preserve valid questions after provider failure. Exercise keep/resolve history updates and filtered reopening against an isolated SQLite database.

Provider HTTP tests use stubs and inspect bounded text/image inputs, JSON formats, refusal/incomplete/error handling, sanitized failures and citation validation. Live provider smoke tests are separate from deterministic tests and must use authorized source material. The demo provider is deterministic and is never evidence of model quality.

## Browser evidence

Cover PDF import, title/author, actual rendered text selection, demo question, citation navigation, saved note/history and resume after reload. Capture synthetic screenshots for public review. A live DeepSeek smoke test with the original synthetic reading notes verifies the configured adapter separately. User PDFs, local databases, API credentials and private reading history must not appear in committed evidence.

CI runs security checks, typecheck, lint, build, Bun tests and an isolated migration check. Browser checks require a locally installed Chrome/Chromium and are run locally. Record actual pass/fail results and any omitted checks in `docs/LOOP_LOG.md` and the PR; this document states the contract, not a claim that a particular run passed.
