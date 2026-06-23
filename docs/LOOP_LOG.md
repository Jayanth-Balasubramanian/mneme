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
- Documentation cleanup for the new workflow and PR #8 state was applied in commit `4468318`.
- CI passed on PR #8 after `4468318`.
- At this point, the remaining gates were feature video and merge readiness.

### 2026-06-23T16:48Z

- Confirmed scoped documentation update comment on PR #8: <https://github.com/Jayanth-Balasubramanian/mneme/pull/8#issuecomment-4781277564>.
- Confirmed CI passed on PR #8 after the documentation workflow update commit.
- Code hygiene and security remain passed; documentation cleanup is complete under the updated workflow.
- Preparing the feature video gate before merge.

### 2026-06-23T16:54Z

- Recorded the PR #8 source-import feature video using an isolated Chrome instance and direct Chrome DevTools Protocol capture after browser-harness daemon attachment failed to honor the explicit CDP endpoint.
- Video artifact: `docs/artifacts/issue-2-import-flow.mp4`.
- Video evidence:
  - Mobile viewport: 390 x 844.
  - Duration: 7 seconds.
  - Size: 153 KiB.
  - Flow shown: source-import form, synthetic Markdown excerpt, import submission, workflow state changing to `Imported`, and saved source attribution with content hash, source anchors, citation, and study emphasis.
- The excerpt used for capture is synthetic and does not include copied chapter text.
- Final merge readiness now depends on the current PR head having green GitHub checks.

### 2026-06-23T16:58Z

- PR #8 was rebase-merged into `main`: merge commit `ebbc0260b967973c9f5a7e61d7998d2f8a93736d`.
- Issue #2 was closed and relabeled `state:merged`.
- Main-branch CI for the PR #8 merge completed successfully.
- Issue #3 is now the next unblocked implementation slice. It should start only after confirming no new conflicts with the merged source-import API/schema.

### 2026-06-23T17:01Z

- Started issue #3, "Generate validated lesson drafts with a mocked provider".
- Branch/worktree: `issue-3-mocked-generation` at `/private/tmp/mneme-issue-3`, based on main commit `56d750021d36cf5e7cb272d8d4d1f53105c49c51`.
- Moved issue #3 to `state:in-progress`.
- Scheduling a single coding subagent because issue #3 touches shared schemas, AI contracts, server persistence, and integration tests. Issues #4 and #5 stay unscheduled until #3 lands.

### 2026-06-23T17:12Z

- Coding subagent completed issue #3 and opened PR #9: <https://github.com/Jayanth-Balasubramanian/mneme/pull/9>.
- Head commit: `40399e8f96251b20ef9c0db91886b6fa8a4f41f8`.
- Issue #3 moved to `state:ready-for-review`.
- Reported verification passed:
  - `bun run typecheck`
  - `bun test`
  - `bun run lint`
  - `bun run build`
- `MNEME_DB_PATH=/private/tmp/mneme-issue-3-verification.sqlite bun run db:migrate`
- Next gates: code hygiene review comment and security review comment on PR #9. Documentation cleanup runs only after those gates pass.

### 2026-06-23T17:13Z

- User set the overnight loop priority: complete the remaining PRs, prioritizing a working app UI for a guided lesson with checkpoint MCQs.
- It is acceptable to ship manually seeded lesson content generated from the credited public Chapter 17 source if that gets the guided lesson workflow working sooner than fully automated generation.
- Keep the loop autonomous and stop only for genuine human input blockers.
- Coding-agent fallback: if `gpt-5.3-codex-spark` hits capacity or quality limits, use `gpt-5.5` with xhigh reasoning.

### 2026-06-23T17:19Z

- PR #9 review gates requested changes:
  - Code hygiene: reject malformed mixed arrays in provider `conceptKeys` and source-anchor `headingPath`; do not let `provider: "openai"` succeed through the mock provider.
  - Security: verify generated source anchors against the imported chapter source URL and server-derived anchors before persistence; do not expose or persist raw provider exception details as public generation output.
- Moved issue #3 to `state:changes-requested`.
- Scheduling a focused coding fix agent on the same branch before rerunning review gates.

### 2026-06-23T17:24Z

- Review-fix agent pushed commit `cac3deb5078aa9d66212a9eb1acdddaa08d68128`.
- Fix summary:
  - Strictly rejects malformed provider arrays instead of silently dropping invalid members.
  - Keeps `provider: "openai"` from succeeding through the mock provider.
  - Validates generated source anchors against imported chapter provenance before persistence.
  - Sanitizes provider exception failure output.
- Review-fix PR comment: <https://github.com/Jayanth-Balasubramanian/mneme/pull/9#issuecomment-4781740292>.
- CI passed on PR #9 after the fix commit.
- Issue #3 returned to `state:ready-for-review`.
- Next gates: follow-up code hygiene and security review comments.

### 2026-06-24 Documentation update for PR #9

- PR #9 code hygiene follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/9#issuecomment-4781796028>.
- PR #9 security follow-up passed: <https://github.com/Jayanth-Balasubramanian/mneme/pull/9#issuecomment-4781795098>.
- CI is green at PR head `a4bcb070f9d4c7f69f1533bea96381c5a79d7288`.
- At this point, issue #3 was labeled `state:lgtm`.
- Scoped documentation update completed after those gates, under the current workflow where documentation agents update contracts and handoff notes directly rather than acting as a repeated review gate.
- Contract state now records the mocked generation guarantees from issue #3:
  - provider output is schema-validated before persistence;
  - invalid output and provider failures create failed generation runs without studyable lesson units;
  - generated source anchors are checked against the imported chapter source URL and server-derived anchors;
  - `provider: "openai"` returns unsupported-provider behavior until the live adapter exists;
  - provider exception details are sanitized in API responses and persisted failure output.
- Documentation update comments: <https://github.com/Jayanth-Balasubramanian/mneme/pull/9#issuecomment-4781854635> and <https://github.com/Jayanth-Balasubramanian/mneme/pull/9#issuecomment-4781863117>.
- PR #9 was ready for merge after documentation cleanup and green checks.
- After PR #9 lands, the loop priority remains a working guided lesson UI with MCQ checkpoints. Manually seeded credited Chapter 17 lesson content is acceptable if needed to get the guided lesson workflow working sooner. Avoid broad backend expansion unless it directly unblocks import -> generation -> review -> study.

### 2026-06-23T17:40Z

- PR #9 was rebase-merged into `main`: merge commit `9dd96715b22dc3862593e9a376d4dd28d0d1003c`.
- Issue #3 was closed and is labeled `state:merged`.
- Main-branch CI for the PR #9 merge completed successfully.
- Issue #4 is now the next unblocked implementation slice. Keep it UI-focused so the app moves toward a working guided lesson with MCQ checkpoints.

### 2026-06-23T17:45Z

- Started issue #4, "Review lesson units and regenerate a single unit".
- Branch/worktree: `issue-4-review-workflow` at `/private/tmp/mneme-issue-4`.
- Issue #4 is `state:in-progress`.
- The issue #4 worktree already contained WIP review UI/API changes, so a coding subagent is continuing that WIP rather than restarting.
- Coding model: `gpt-5.5` with xhigh reasoning, using the user-approved fallback because this is a large UI-heavy WIP that needs cleanup as well as completion.
- Issue #5 remains unscheduled because it overlaps the same UI/API/study path and depends on approved-unit review behavior from issue #4.

### 2026-06-23T17:59Z

- Coding subagent opened PR #10 for issue #4: <https://github.com/Jayanth-Balasubramanian/mneme/pull/10>.
- Head commit: `2ed2d2dd3ca4643d2ba7159b18bab9f04eb6ed4b`.
- Issue #4 moved to `state:ready-for-review`.
- Reported verification passed: `bun run typecheck`, `bun test`, `bun run lint`, `bun run build`, `MNEME_DB_PATH=/private/tmp/mneme-issue-4-verification.sqlite bun run db:migrate`, and `bun run test:e2e` as a deferred placeholder.
- At PR opening, GitHub reported PR #10 merge state as `DIRTY`, and no PR checks had reported yet. Review gates could proceed, but merge readiness still required a rebase/conflict pass and green checks.

### 2026-06-23T18:07Z

- PR #10 review gates requested changes:
  - Code hygiene: checkpoint prompt/expected answer/rubric must be editable before approval.
  - Code hygiene: review screen must show actual bounded source-context snippets, not only source-anchor metadata.
  - Security: single-unit regeneration must route output through the same schema/provenance validation path as initial generation and leave the existing unit unchanged on invalid regenerated output.
- Review comments: <https://github.com/Jayanth-Balasubramanian/mneme/pull/10#issuecomment-4782092371> and <https://github.com/Jayanth-Balasubramanian/mneme/pull/10#issuecomment-4782075869>.
- Moved issue #4 to `state:changes-requested`.
- Scheduling a focused fix agent on `issue-4-review-workflow`.

### 2026-06-23T18:25Z

- PR #10 fix agent pushed commit `2bedad2fa74f559a32b0a8510d8eb7df7f5ac0bc`.
- Fix summary:
  - Added editable checkpoint prompt, expected answer, and rubric handling.
  - Added bounded source-context snippets derived from stored chapter Markdown and source anchors.
  - Routed single-unit regeneration through shared output/provenance validation before replacement.
  - Rebased onto current `origin/main`; merge state is now clean.
- Fix comment: <https://github.com/Jayanth-Balasubramanian/mneme/pull/10#issuecomment-4782219087>.
- CI passed on PR #10 after the fix commit.
- Issue #4 returned to `state:ready-for-review`.
- Next gates: follow-up code hygiene and security review comments.

### 2026-06-24 Documentation update for PR #10

- PR #10 code hygiene follow-up passed after the review workflow fixes: <https://github.com/Jayanth-Balasubramanian/mneme/pull/10#issuecomment-4782257229>.
- PR #10 security follow-up passed after the regeneration validation fixes: <https://github.com/Jayanth-Balasubramanian/mneme/pull/10#issuecomment-4782262804>.
- PR #10 is rebased onto current `main`; merge state is clean and CI is green after review fixes.
- Issue #4 is `state:lgtm`; documentation cleanup is complete as a scoped updater pass.
- The issue #4 implementation now covers the required follow-up themes:
  - checkpoint prompt, expected answer, and rubric are editable before approval;
  - review statuses are `draft`, `approved`, `rejected`, and `needs_regeneration`, and only approved units are exposed through the study path;
  - review API/UI expose bounded source-context snippets derived from stored Markdown and source anchors, not full chapter dumps;
  - single-unit regeneration reuses generated-output schema validation and source-anchor provenance checks before replacement;
  - successful regeneration replaces only the selected unit and returns it to `draft`;
  - failed regeneration records a failed generation run and leaves existing lesson units unchanged.
- This documentation pass is a scoped updater step after passed code hygiene/security gates. It is not a repeated documentation review gate or nitpick pass.
- Remaining PR #10 gates after documentation cleanup: feature video and final merge readiness.
- After issue #4 lands, the overnight priority remains issue #5: complete the guided study and telemetry slice, centered on a working guided lesson UI with MCQ checkpoint attempts.

### 2026-06-23T18:40Z

- Recorded the PR #10 review-workflow feature video using an isolated Chrome instance and direct Chrome DevTools Protocol capture.
- Video artifact: `docs/artifacts/issue-4-review-flow.mp4`.
- Video evidence:
  - Mobile viewport: 390 x 844.
  - Duration: 8 seconds.
  - Size: 261 KiB.
  - Flow shown: synthetic Markdown import, mock lesson generation, review cards with bounded source-context snippets, editable checkpoint prompt, approval, workflow state showing one approved unit, and study-ready preview showing the edited checkpoint.
- The excerpt used for capture is synthetic and does not include copied chapter text.
- Final merge readiness now depends on green GitHub checks on the current PR head.

### 2026-06-23T18:45Z

- PR #10 passed GitHub checks after the feature-video artifact commit.
- PR #10 was rebase-merged into `main`: merge commit `5782403470fe30ef1060400ca7dc3e3976ed753a`.
- Issue #4 was closed and relabeled `state:merged`.
- Main-branch CI for the PR #10 merge completed successfully: <https://github.com/Jayanth-Balasubramanian/mneme/actions/runs/28048909049>.
- Issue #5 is now the next unblocked implementation slice. The loop priority is a working guided lesson UI with checkpoint MCQs and telemetry; manually seeded, credited Chapter 17 lesson content is acceptable if it avoids committing full chapter text.

## Queue Snapshot

- #2 Import chapter excerpt with source attribution: `merged`; PR #8 merged; issue #2 closed.
- #3 Generate validated lesson drafts with a mocked provider: `merged`; PR #9 merged; issue #3 closed.
- #4 Review lesson units and regenerate a single unit: `merged`; PR #10 merged; issue #4 closed.
- #5 Study approved units and record telemetry: `ready-for-agent`; unblocked; next product priority is completing study and telemetry with a working guided lesson UI and MCQ checkpoint attempts.
- #6 Expand CI with app-specific security tests and Cloudflare deployment: `needs-spec`.
