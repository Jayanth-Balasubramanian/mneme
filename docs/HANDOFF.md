# Handoff

## Current State

This repository is initialized and contains planning/contract documentation plus implementation slices for a local-first AI-assisted study app. PR #7 merged issue #1 with a Bun/Vite/Hono runtime scaffold, minimal Mneme app shell, health route, and unit smoke test. PR #8 implements issue #2 with Markdown excerpt import, source attribution, local SQLite persistence, and import-result UI.

Git:

- Branch: `main`
- History: setup commits are on `main`; use `git log --oneline` for the current head.
- Remote: `git@github.com:Jayanth-Balasubramanian/mneme.git`

GitHub:

- GitHub CLI is installed.
- GitHub CLI authentication is complete as `Jayanth-Balasubramanian`.
- Intended repository name: `mneme`.
- Intended visibility: public, to use GitHub Actions CI credits.
- Repository URL: <https://github.com/Jayanth-Balasubramanian/mneme>
- CI status: passing on `main` after the scaffold merge; use GitHub Actions for the current run state.

## Product Decision

The PoC studies *Deep Learning*, Chapter 17, "Monte Carlo Methods", by Ian Goodfellow, Yoshua Bengio, and Aaron Courville. Always credit this source in generated lessons, study screens, examples, fixtures, exports, and documentation.

Do not commit the full chapter text unless reuse rights are explicitly confirmed. Use user-supplied Markdown excerpts in local app data and minimal/synthetic fixtures in tests.

## Contract Documents

- `AGENTS.md`: operating contract for agents.
- `CONTEXT.md`: domain glossary.
- `docs/SPEC.md`: product and architecture spec.
- `docs/API_CONTRACT.md`: intended API surface.
- `docs/TEST_CONTRACT.md`: testable behavior gates.
- `docs/SOURCES.md`: source credit and citation.
- `docs/adr/0001-runtime-and-ui-stack.md`: runtime/UI stack decision.

## Implementation Direction

Stack:

- Bun
- TypeScript
- Vite React SPA
- Hono/Web Fetch API
- Repository interfaces over local SQLite, with D1-compatible SQL migration direction; Drizzle is deferred until the query surface earns the dependency
- shadcn/ui components, copied selectively when a concrete screen needs them
- OpenAI behind a provider interface, mocked provider first

Workflow:

- GitHub issues are the issue queue.
- GitHub pull requests are the review/merge surface.
- No issue files should live under `docs/`.
- Use rebase-only integration.
- At most two implementation agents should run in parallel.
- Coding subagents use `gpt-5.3-codex-spark` with xhigh reasoning.
- Code hygiene and security review subagents use `gpt-5.5` with xhigh reasoning and post findings as PR comments.
- Documentation-agent review subagents use `gpt-5.5` with high reasoning and post findings as PR comments.
- GitHub Actions owns CI, initially for policy/security checks and tests; later for continuous deployment.
- Before merge, each implementation PR needs code hygiene review, security review, documentation-agent review, and a short feature video recorded with browser-harness or Chrome tooling.
- `docs/LOOP_LOG.md` is the running proof-of-work log and should be monitored for live progress.

Security posture:

- The repository is public, so agents must treat committed files, fixtures, logs, screenshots, and CI artifacts as public.
- Public-repo policy checks belong in CI from day one. Dependabot and deeper dependency security checks are ready follow-up work now that `package.json` exists; track the broader CI/security expansion under issue #6.
- Full copyrighted chapter text must not be committed without explicit reuse rights.

## GitHub Issues

GitHub is the source of truth for issue state. These issues have been created:

1. [#1 Scaffold local Bun/Vite/Hono app](https://github.com/Jayanth-Balasubramanian/mneme/issues/1)
   - State: `state:merged`, closed
   - PR: [#7 Scaffold local Bun/Vite/Hono app](https://github.com/Jayanth-Balasubramanian/mneme/pull/7)
   - Review gates: code hygiene passed; documentation-agent passed; security passed.
   - CI: passing on PR #7 and merged to `main`.
   - Blocked by: none
   - Owns: package/config, initial app/server folders, smoke tests

2. [#2 Import chapter excerpt with source attribution](https://github.com/Jayanth-Balasubramanian/mneme/issues/2)
   - State: `state:ready-for-review`
   - PR: [#8 Import chapter excerpts with source attribution](https://github.com/Jayanth-Balasubramanian/mneme/pull/8)
   - Review gates: initial code hygiene and documentation-agent fixes applied; follow-up review gates pending.
   - CI: passing on PR #8 after `abe6f7b`.
   - Blocked by: follow-up review gates and feature video before merge
   - Owns: source metadata, source anchors, import flow, attribution display

3. [#3 Generate validated lesson drafts with a mocked provider](https://github.com/Jayanth-Balasubramanian/mneme/issues/3)
   - State: `ready-for-agent`
   - Blocked by: none; issue 1 is merged
   - Owns: `LessonGenerator` contract, output validation, generation runs

4. [#4 Review lesson units and regenerate a single unit](https://github.com/Jayanth-Balasubramanian/mneme/issues/4)
   - State: `ready-for-agent`
   - Blocked by: issues 2 and 3
   - Owns: review states, editing, approving/rejecting, single-unit regeneration

5. [#5 Study approved units and record telemetry](https://github.com/Jayanth-Balasubramanian/mneme/issues/5)
   - State: `ready-for-agent`
   - Blocked by: issue 4
   - Owns: study path, attempts, weak-concept query

6. [#6 Expand CI with app-specific security tests and Cloudflare deployment](https://github.com/Jayanth-Balasubramanian/mneme/issues/6)
   - State: `needs-spec`
   - Blocked by: issue 1 and Cloudflare deployment spec/secrets policy
   - Owns: app-specific security tests and future continuous deployment

## Remaining Human Inputs

1. Decide whether self-assessment remains the only PoC grading mode, or whether optional post-answer AI feedback is allowed.
2. Decide whether deployed Cloudflare storage may retain full source Markdown, or whether full source text remains local-only.
3. Choose the initial OpenAI model for the live adapter.

## Latest Loop Run: Issue #2 Source Import

Deliverables:

- Added `POST /api/chapter-sources` for user-supplied Markdown excerpt import.
- Added source metadata validation, SHA-256 content hashing, Markdown paragraph source anchors, and source credit response shape.
- Added local SQLite migration/repository support and activated `bun run db:migrate`.
- Added a mobile-first import form with paste/upload support and an import result that credits *Deep Learning*, Chapter 17.
- Updated CI to run a temp-path migration check.
- Added ADR 0002 documenting the repository-first SQLite decision.

Completed:

- Local verification passed: `bun run typecheck`, `bun test`, `bun run lint`, `bun run build`, and `MNEME_DB_PATH=/private/tmp/mneme-issue-2-verification.sqlite bun run db:migrate`.
- PR #8 was opened against `main` and linked to issue #2.

Todos:

- Run code hygiene, security, and documentation-agent review gates for PR #8.
- Fix any review findings before moving issue #2 to `state:lgtm` or `state:ready-to-merge`.
- After issue #2 merges, schedule issue #3 only after checking for shared-schema/API conflicts with the import slice.

Issues:

- Browser e2e remains deferred until the complete import -> generation -> review -> study path exists.
- The local SQLite adapter is Bun-specific behind `src/server/db/`; Cloudflare D1 support should be added as a separate adapter later.
