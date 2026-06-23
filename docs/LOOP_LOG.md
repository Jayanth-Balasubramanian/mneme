# Loop Log

This is the running proof-of-work log for the Mneme issue loop. GitHub issues and pull requests remain the source of truth for actionable state; this file records orchestration progress, verification evidence, review gates, videos, and blockers.

## Current Workflow Contract

- Coding subagents use `gpt-5.3-codex-spark` with xhigh reasoning.
- Code hygiene and security review subagents use `gpt-5.5` with xhigh reasoning. They remain PR review gates and post pass/fail findings as PR comments.
- Documentation-agent updater subagents use `gpt-5.5` with high reasoning after code hygiene and security pass. They make scoped documentation updates directly and post a summary comment with the commit and verification; they are not repeated review or nitpick gates.
- Before merging a working feature, record a short feature video with browser-harness or Chrome tooling. If recording is blocked, document the exact blocker here and on the PR.
- Keep the GitHub issue state machine current: `needs-human`, `needs-spec`, `ready-for-agent`, `in-progress`, `ready-for-review`, `changes-requested`, `lgtm`, `ready-to-merge`, `merged`.
- Use rebase-only merge flow.

## Run Log

### 2026-06-23T15:39Z

- Merged PR #7 for issue #1, "Scaffold local Bun/Vite/Hono app", using GitHub rebase merge.
- Issue #1 closed and relabeled `state:merged`.
- Review gates passed before merge:
  - Code hygiene: pass after `bun run typecheck` was changed to `tsc -b --noEmit`.
  - Security: pass; no public-repo leakage or full chapter text risk found.
  - Documentation-agent: pass; README, AGENTS.md, SPEC, TEST/API contracts, and handoff aligned.
- CI passed on PR #7 and then on `main`.
- Browser-harness render verification was blocked because local Chrome remote debugging was not enabled; API and Vite loopback HTTP smoke passed.

### 2026-06-23T15:42Z

- Started issue #2, "Import chapter excerpt with source attribution".
- Branch/worktree: `issue-2-import-source` at `/private/tmp/mneme-issue-2`.
- Moved issue #2 to `state:in-progress`.
- Did not run issue #3 in parallel because #2 and #3 overlap on shared schemas, database migrations, and API contracts.

### 2026-06-23T15:59Z

- User changed loop policy:
  - Coding agents must use Codex Spark xhigh.
  - Review agents must post findings as PR comments.
  - Documentation agents must keep frontend/backend docs current before merge.
  - Record a short feature video before merging working feature PRs.
  - Maintain this log as the primary monitorable proof-of-work artifact.
- The pre-policy issue #2 worker had already committed, pushed, opened PR #8, moved issue #2 to `state:ready-for-review`, and reported green CI before the stop instruction landed.
- Because PR #8 already exists and CI is green, the loop is proceeding with the requested review/doc model routing instead of redoing the same implementation.

### 2026-06-23T16:00Z

- Verified PR #8:
  - PR: <https://github.com/Jayanth-Balasubramanian/mneme/pull/8>
  - Issue: <https://github.com/Jayanth-Balasubramanian/mneme/issues/2>
  - Head: `94f67e7ca8f7ad8f2063268f263d1e96fbc9a42c`
  - Merge state: clean.
  - CI: policy, project, and deployment placeholder checks passing.
- Added this running log and workflow amendments to PR #8 so they merge with the active feature slice.
- Next gates for PR #8:
  - Code hygiene review comment by `gpt-5.5` xhigh.
  - Security review comment by `gpt-5.5` xhigh.
  - Documentation-agent cleanup by `gpt-5.5` high after code hygiene and security pass.
  - Feature video before merge if review gates pass.

### 2026-06-23T16:08Z

- PR #8 review comments posted:
  - Documentation-agent: changes requested. Required docs fixes: stale Drizzle references, ADR 0001/0002 conflict, missing required import metadata in SPEC, incomplete `POST /api/chapter-sources` error/status docs, stale source-attribution test language.
  - Code hygiene: changes requested. Required code fixes: persist/return `emphasisNotes`; avoid rendering `Chapter undefined` when chapter number is omitted.
  - Security: pass.
- Moved issue #2 to `state:changes-requested`.
- Applying code and docs fixes in the PR #8 worktree.

### 2026-06-23T16:18Z

- Pushed PR #8 review-fix commit `abe6f7b`, covering:
  - Persisting and returning `emphasisNotes` through migration, repository, API response type, UI display, and integration tests.
  - Avoiding `Chapter undefined` when imported source metadata omits `chapterNumber`.
  - Updating SPEC, API contract, test contract, ADR, handoff, and loop workflow docs for the source-import slice.
- Local verification passed after the fix:
  - `bun run typecheck`
  - `bun test`
  - `bun run lint`
  - `bun run build`
  - `MNEME_DB_PATH=/private/tmp/mneme-issue-2-review-fix.sqlite bun run db:migrate`
- CI passed on PR #8 after `abe6f7b`.
- Follow-up documentation review requested a log freshness fix because this queue snapshot still said fixes were in progress after `abe6f7b` was pushed.
- This narrow log-state correction is included in the current PR update. The next gate is follow-up review comments on PR #8.

### 2026-06-24 Documentation workflow update

- User updated the loop workflow: code hygiene and security remain PR review gates that post PR comments, while documentation agents now run after those gates pass as scoped documentation updaters rather than repeated review gates.
- PR #8 code hygiene follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/8#issuecomment-4781225906>.
- PR #8 security follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/8#issuecomment-4781224173>.
- The earlier documentation review comment remains useful cleanup input under the old model, but it is not a live gate under the updated workflow: <https://github.com/Jayanth-Balasubramanian/mneme/pull/8#issuecomment-4781248688>.
- Documentation cleanup for the new workflow and PR #8 state is being applied in this PR. Next gates are CI, feature video, and merge readiness.

## Queue Snapshot

- #2 Import chapter excerpt with source attribution: `ready-for-review`; PR #8 open; code hygiene and security passed; documentation cleanup is being applied; next gates are CI, feature video, and merge readiness.
- #3 Generate validated lesson drafts with a mocked provider: `ready-for-agent`, intentionally waiting on #2 because of overlap.
- #4 Review lesson units and regenerate a single unit: blocked by #2 and #3.
- #5 Study approved units and record telemetry: blocked by #4.
- #6 Expand CI with app-specific security tests and Cloudflare deployment: `needs-spec`.
