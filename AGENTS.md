# Agent Operating Contract

Read docs/SPEC.md first. Mneme is a desktop-first PDF reader with a contextual companion for starting, understanding and resuming reading. The September 2026 reader rescope supersedes the generated-lesson PoC. Update the spec before changing scope; update CONTEXT.md for terminology.

## Boundaries
- Bun only, one package, Vite React and Hono/Web Fetch APIs. No npm/yarn/pnpm lockfiles.
- UI/PDF adapters in src/app/; HTTP in src/server/; direct database access only in src/server/db/; provider code only in src/server/ai/; portable workflow logic in src/domain/; runtime-neutral contracts in src/shared/.
- Domain/shared must not import UI, database, provider SDKs or Bun/Node-specific APIs. Local choices stay behind adapters. Keep SQL SQLite-compatible.
- Small, purposeful dependencies. Use existing PDF rendering. Do not execute PDF scripts, MDX, arbitrary generated HTML or embedded code.
- PDFs, extracted text, keys and real user questions are private local data. Repository/CI are public. Commit only original synthetic or explicitly reusable fixtures. Ask before sending a full copyrighted chapter to an external model.
- Credit title/author when known and preserve document/page/selection traceability. No invented citations. Validate provider output and citation provenance before saving.
- Reading position and context boundary are distinct; browsing never silently expands the boundary. Retrieved text and history must obey it.
- Store questions/notes durably without inferring understanding. Preserve prior PoC data in additive migrations.
- No quizzes, flashcards, grading, scheduling, EPUB, OCR, accounts or deployment without user direction.

## Verification and workflow
- GitHub issues are the only queue. Use gh, branches and PRs. If unavailable record GitHub sync as needs-human; no docs issue queue.
- Maintain docs/LOOP_LOG.md for assignments, PRs, reviews, videos and blockers. Keep README, API/test contracts and handoff accurate.
- Narrow unit/typechecks for domain/contracts, isolated SQLite integration tests for persistence, PDF browser flow for UI. Provider output/error/provenance cases need tests. Report unrun checks with command/reason/risk.
- Stable commands: bun run build, bun run typecheck, bun run lint, bun run security:check, bun test, bun run test:e2e, bun run db:migrate, bun run db:studio (explicit deferred placeholder allowed).
- CI checks pushes to main and PRs. Extend public-repo security checks for new integrations.
- Before completion run code hygiene/security review then documentation verification. Record feature video or exact blocker. Never commit user PDFs/secrets in artifacts.
- Current user routing: parent handles planning/orchestration/integration/code/security reviews/documentation. Use gpt-5.6-luna xhigh for implementation. At most one subagent active at a time. Assign concrete write ownership and avoid concurrent edits. This overrides prior spark and review-subagent routing.
- Work on the requested separate branch. Do not merge into main without user direction.
