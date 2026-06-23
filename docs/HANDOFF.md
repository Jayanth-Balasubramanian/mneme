# Handoff

## Current State

This repository is initialized and contains planning/contract documentation plus implementation slices for a local-first AI-assisted study app. PR #7 merged issue #1 with a Bun/Vite/Hono runtime scaffold, minimal Mneme app shell, health route, and unit smoke test. PR #8 implemented issue #2 with Markdown excerpt import, source attribution, local SQLite persistence, and import-result UI. PR #9 implemented issue #3 with validated mocked lesson generation. PR #10 implemented issue #4 with lesson review, edit, approval, source-context snippets, and single-unit regeneration.

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
- CI status: passing on current `main`; use GitHub Actions for the current run state.

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
- Code hygiene and security review subagents use `gpt-5.5` with xhigh reasoning. They remain PR review gates and post pass/fail findings as PR comments.
- Documentation-agent updater subagents use `gpt-5.5` with high reasoning after code hygiene and security pass. They make scoped documentation updates directly and post a summary comment with the commit and verification; they are not repeated review or nitpick gates.
- GitHub Actions owns CI, initially for policy/security checks and tests; later for continuous deployment.
- Before merge, each implementation PR needs passing code hygiene and security review gates, scoped documentation cleanup after those gates pass, and a short feature video recorded with browser-harness or Chrome tooling.
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
   - State: `state:merged`, closed
   - PR: [#8 Import chapter excerpts with source attribution](https://github.com/Jayanth-Balasubramanian/mneme/pull/8)
   - Review gates: code hygiene follow-up passed; security follow-up passed; documentation cleanup complete under the updated scoped-updater workflow.
   - Video: `docs/artifacts/issue-2-import-flow.mp4`
   - CI: passing on PR #8 before merge and on `main` after merge.
   - Blocked by: none
   - Owns: source metadata, source anchors, import flow, attribution display

3. [#3 Generate validated lesson drafts with a mocked provider](https://github.com/Jayanth-Balasubramanian/mneme/issues/3)
   - State: `state:merged`, closed
   - Branch/worktree: `issue-3-mocked-generation` at `/private/tmp/mneme-issue-3`
   - PR: [#9 Generate validated lesson drafts with a mocked provider](https://github.com/Jayanth-Balasubramanian/mneme/pull/9)
   - Verification reported by coding subagent: `bun run typecheck`, `bun test`, `bun run lint`, `bun run build`, and `MNEME_DB_PATH=/private/tmp/mneme-issue-3-verification.sqlite bun run db:migrate`.
   - Review-fix commit: `cac3deb5078aa9d66212a9eb1acdddaa08d68128`; CI passing after the fix.
   - Code hygiene follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/9#issuecomment-4781796028>.
   - Security follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/9#issuecomment-4781795098>.
   - Documentation cleanup: scoped docs update for the mocked generation API/contract is complete after the passed review gates; this is not a repeated review gate.
   - Implemented contract: mocked generation validates provider output, records failed runs without studyable units, validates generated source anchors against imported chapter provenance, rejects unsupported `provider: "openai"` requests until the live adapter exists, and sanitizes provider exception details.
   - Merge: rebase-merged into `main` at `9dd96715b22dc3862593e9a376d4dd28d0d1003c`; main CI passed after merge.
   - Blocked by: none
   - Priority note: after this lands, continue toward a working guided lesson UI with checkpoint MCQs, accepting manually seeded lesson content from the credited public Chapter 17 source if needed.
   - Owns: `LessonGenerator` contract, output validation, generation runs

4. [#4 Review lesson units and regenerate a single unit](https://github.com/Jayanth-Balasubramanian/mneme/issues/4)
   - State: `state:merged`, closed
   - Branch/worktree: `issue-4-review-workflow` at `/private/tmp/mneme-issue-4`
   - PR: [#10 Review generated lesson units](https://github.com/Jayanth-Balasubramanian/mneme/pull/10)
   - Video: `docs/artifacts/issue-4-review-flow.mp4`
   - Merge: rebase-merged into `main` at `5782403470fe30ef1060400ca7dc3e3976ed753a`; main CI passed after merge.
   - Blocked by: none; issues 1-3 are merged
   - Assignment: coding subagent continuing existing WIP with `gpt-5.5` xhigh because the slice is UI-heavy and already had substantial local edits.
   - Code hygiene follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/10#issuecomment-4782257229>.
   - Security follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/10#issuecomment-4782262804>.
   - Documentation cleanup: scoped updater pass updated the spec, API contract, test contract, handoff, and loop log after passed review gates; this is not a repeated review gate.
   - Implemented contract: lesson fields plus checkpoint prompt/expected answer/rubric can be edited before approval; review statuses are `draft`, `approved`, `rejected`, and `needs_regeneration`; only approved units are returned for study; review responses and UI expose bounded source-context snippets rather than full chapter dumps; single-unit regeneration validates output/provenance before replacing only the selected unit, resets the replacement to draft, and leaves all existing units unchanged on failed regeneration.
   - Owns: review states, editing, approving/rejecting, single-unit regeneration

5. [#5 Study approved units and record telemetry](https://github.com/Jayanth-Balasubramanian/mneme/issues/5)
   - State: `state:in-progress`
   - Branch/worktree: `issue-5-study-telemetry` at `/private/tmp/mneme-issue-5`
   - Blocked by: none; issue 4 is merged
   - Current priority: complete the guided study and telemetry slice, with emphasis on a working guided lesson UI and MCQ checkpoint attempts.
   - Implementation note: an existing #5 worktree contains early untracked study schema/domain seeds; keep useful pieces, but fix them before committing.
   - Agent note: the initial `gpt-5.3-codex-spark` worker hit its usage limit; work continued with a `gpt-5.5` xhigh fallback worker on the same worktree.
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

Final PR #8 state:

- Code hygiene follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/8#issuecomment-4781225906>.
- Security follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/8#issuecomment-4781224173>.
- The old documentation review comment is cleanup input, not a repeated review gate: <https://github.com/Jayanth-Balasubramanian/mneme/pull/8#issuecomment-4781248688>.
- Documentation cleanup is complete under the updated workflow.
- Feature video recorded at `docs/artifacts/issue-2-import-flow.mp4` using an isolated Chrome instance and direct Chrome DevTools Protocol capture.
- PR #8 was rebase-merged into `main` at `ebbc0260b967973c9f5a7e61d7998d2f8a93736d`.
- Issue #2 is closed with `state:merged`.
- Main-branch CI passed after the merge.

## Latest Loop Run: Issue #3 Mocked Lesson Generation

Deliverables:

- Added a mocked `LessonGenerator` path behind the provider contract.
- Added `POST /api/generation-runs` behavior for draft lesson generation from an imported chapter source.
- Added schema validation for generated lesson units and checkpoints before persistence.
- Added failed-run recording for invalid provider output and provider failures, without creating lesson units or checkpoints.
- Added source-anchor provenance validation against the imported chapter source URL and server-derived anchors.
- Added unsupported-provider behavior so `provider: "openai"` does not silently succeed through the mock generator.
- Sanitized provider exception details in public API responses and persisted failure output.

Completed:

- Code hygiene follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/9#issuecomment-4781796028>.
- Security follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/9#issuecomment-4781795098>.
- CI is green at PR head `a4bcb070f9d4c7f69f1533bea96381c5a79d7288`.
- Issue #3 reached `state:lgtm` before merge.
- Documentation cleanup is now a scoped updater pass after code hygiene/security, not a review gate.
- PR #9 was rebase-merged into `main` at `9dd96715b22dc3862593e9a376d4dd28d0d1003c`.
- Issue #3 is closed with `state:merged`.
- Main-branch CI passed after the merge.

Next:

- Land issue #4 after the scoped documentation update, then schedule issue #5 with priority on a working guided lesson UI with MCQ checkpoint attempts and telemetry. The fastest acceptable path may use manually seeded credited Chapter 17 lesson content while preserving source attribution.

Issues:

- Browser e2e remains deferred until the complete import -> generation -> review -> study path exists.
- The local SQLite adapter is Bun-specific behind `src/server/db/`; Cloudflare D1 support should be added as a separate adapter later.

## Latest Loop Run: Issue #4 Review Workflow

Deliverables:

- Added review workflow support for editing generated lesson units and approving, rejecting, or marking units as needing regeneration.
- Added editable checkpoint prompt, expected answer, and rubric handling before approval.
- Added bounded source-context snippets for review UI/API responses; the review path should not expose full chapter Markdown dumps.
- Added single-unit regeneration that preserves other lesson units and validates regenerated output plus source-anchor provenance before replacing the target unit.
- Failed regeneration stores a failed generation run with sanitized error output and leaves existing lesson units unchanged.

Completed:

- Code hygiene follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/10#issuecomment-4782257229>.
- Security follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/10#issuecomment-4782262804>.
- PR #10 was rebased onto current `main`; merge state was clean and CI was green after review fixes.
- Documentation cleanup ran as a scoped updater pass after code hygiene/security, not a repeated review gate.
- Feature video recorded at `docs/artifacts/issue-4-review-flow.mp4` using an isolated Chrome instance and direct Chrome DevTools Protocol capture.
- PR #10 was rebase-merged into `main` at `5782403470fe30ef1060400ca7dc3e3976ed753a`.
- Issue #4 is closed with `state:merged`.
- Main-branch CI passed after the merge.

Next:

- Start issue #5: complete study and telemetry with a working guided lesson UI and MCQ checkpoint attempts. The fastest acceptable path may use manually seeded, credited Chapter 17 lesson content while preserving source attribution and avoiding full chapter text in git.
