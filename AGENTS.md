# Agent contract

Read `docs/ARCHITECTURE.md` before changing the application.

- Use Bun, one package, Vite/React, Hono, and SQLite. Do not add npm/yarn/pnpm lockfiles.
- Keep UI and PDF code in `src/app`, HTTP in `src/server/api`, database access in `src/server/db`, providers in `src/server/ai`, portable logic in `src/domain`, and runtime-neutral contracts in `src/shared`.
- Preserve inward dependencies and SQLite-compatible, additive migrations.
- Treat PDFs, extracted text, credentials, questions, and local databases as private. Never commit them or send an entire PDF/chapter to a model.
- Keep model tools bounded to the active book. Validate inputs, output provenance, and citations before persistence. Do not execute PDF scripts, raw HTML, MDX, or generated code.
- The current product is the PDF reader with plain book chat. Legacy lesson data remains compatible but does not define the UI.
- Work on a `codex/` branch and open a PR; do not merge without user direction.
