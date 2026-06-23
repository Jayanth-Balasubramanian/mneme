# Agent Operating Contract

This file is the working contract for agents building the AI-assisted technical book study app. It complements `docs/SPEC.md`; if the two conflict, stop and resolve the conflict before implementing.

## Scope

- Build the PoC defined in `docs/SPEC.md`: Markdown chapter import, AI lesson draft generation, review/edit/approval, guided study checkpoints, and SQLite-backed telemetry.
- Optimize the workflow first. Prefer correctness, source traceability, editable generated output, and durable study telemetry over broad feature count.
- Treat the first learner profile as fixed unless the user changes it: CS undergraduate, applied ML background, comfortable with math notation, needs formal definitions paired with strong intuition.
- Keep scheduling, authentication, multi-user support, PDF/EPUB ingestion, automatic AI grading, and Cloudflare deployment out of PoC scope unless the user explicitly reopens them.
- Use Bun for package management and project commands.
- Do not introduce `npm`, `yarn`, or `pnpm` lockfiles.
- Use shadcn/ui components selectively, copying only components needed by current screens.
- Build mobile-first and keep the frontend dependency set small.
- Always credit book/source material in generated lessons, study screens, docs, fixtures, and exports.
- Treat this as a public repository named `mneme`; assume every committed file and CI artifact is public.
- Never commit API keys or copyrighted book source files. Ask before sending a full copyrighted chapter to an external model.

## Routing

- Use `docs/SPEC.md` as the product source of truth for flows, data model, and acceptance criteria.
- Update `docs/SPEC.md` before implementing a product behavior or scope change.
- Update `CONTEXT.md` when a domain term is resolved or renamed.
- Add a short ADR under `docs/adr/` only when a decision is hard to reverse, surprising without context, and the result of a real trade-off.
- Update this file when an agent operating rule, boundary, or verification contract changes.
- Use GitHub issues as the only issue queue. Do not create or maintain issue files under `docs/`.
- Use GitHub pull requests for implementation review and merge flow.
- Put learner-facing UI in `src/app/`.
- Use a single Bun package with a Vite React SPA and Hono/Web Fetch API unless the user revisits the architecture.
- Put HTTP route handlers and runtime wiring in `src/server/`.
- Put database connection, migrations, and repositories in `src/server/db/`.
- Put AI provider interfaces, prompts, output schemas, and provider adapters in `src/server/ai/`.
- Put domain types and workflow rules in `src/domain/`.
- Put shared validation schemas used by both client and server in `src/shared/`.
- Put unit tests in `tests/unit/`, integration tests in `tests/integration/`, and browser tests in `e2e/`.
- Keep generated lesson content in draft state until the review workflow approves it. The study workflow must only consume approved units.

## Package Boundaries

- `src/domain/` must not import React, HTTP request/response objects, database clients, provider SDKs, or runtime-specific APIs.
- `src/shared/` must stay runtime-neutral. It may contain schemas and serializable types, but not database, provider, or UI code.
- `src/server/ai/` is the only place provider SDKs may be imported. Domain code depends on a `LessonGenerator` interface, not OpenAI directly.
- `src/server/db/` is the only place direct database access belongs. Other code should use repositories or application services.
- UI routes call server APIs or client-side action wrappers; they should not import repositories or provider adapters directly.
- Local Node-only code is allowed only in local runtime adapters. Core server handlers, schemas, and domain logic should stay portable to Cloudflare Workers and D1.
- Local-only Bun or Node choices are acceptable behind adapters during the PoC; they must not leak into `src/domain/`, `src/shared/`, or portable server contracts.
- Database schema should remain SQLite/D1-compatible unless the user approves a storage change.

## Verification

- Before marking implementation work complete, run the narrowest relevant checks plus any broader checks touched by the change.
- For domain or schema changes, run unit tests and typecheck.
- For repository, migration, or persistence changes, run integration tests against an isolated SQLite database.
- For UI workflow changes, run a browser flow covering import, generation with a mocked provider, review, study, and attempt recording.
- For AI generation changes, validate provider output against a schema before saving and test invalid-output handling.
- Before merging implementation pull requests, code hygiene and security remain PR review gates. Those review subagents post pass/fail findings as PR comments.
- After code hygiene and security pass, run a documentation-agent pass that checks frontend docs, backend/API docs, test contracts, and handoff notes are current, then applies narrowly scoped documentation updates directly. The documentation agent is not a repeated review or nitpick gate.
- If a required check cannot run, report the command, failure reason, and residual risk.
- Before merging a working feature PR, record a short feature video showing the implemented workflow. Use browser-harness or the Chrome/computer-use tool. If video capture is blocked, record the exact blocker in `docs/LOOP_LOG.md` and the PR.
- Expected project commands, once scaffolded, are:

```bash
bun run build
bun run typecheck
bun run lint
bun test
bun run test:e2e
bun run db:migrate
bun run db:studio
```

`bun run db:migrate` is active for local SQLite migrations. `bun run test:e2e` and `bun run db:studio` may be explicit deferred placeholders until browser coverage and database inspection tooling land, but the command names must remain stable.
- GitHub Actions must run policy/security checks and project checks on pushes to `main` and pull requests.
- Security checks belong in CI and should expand over time; do not rely on manual review alone for secrets/public-repo policy.

## Workflow Rules

- Start by reading `docs/SPEC.md` and this file. If the requested work changes product scope, update the spec or ask before coding.
- Preserve source traceability for every generated lesson unit and checkpoint. Do not save provider output that lacks usable source anchors.
- Preserve source attribution for every chapter source. Do not commit the full Deep Learning chapter text; keep repository fixtures minimal unless reuse rights are confirmed.
- Prefer small vertical slices through the import -> draft -> review -> study -> telemetry path over isolated infrastructure.
- Model AI output as untrusted. Validate it, store raw generation output for debugging, and require review before study.
- Regeneration in v1 targets one lesson unit at a time. Do not regenerate an entire lesson draft or an individual checkpoint unless the user changes this decision.
- Keep self-assessment as the PoC grading mode. Do not add AI grading without explicit user approval.
- Record enough telemetry to support future remediation: checkpoint answer, self-rating, confidence, concept keys, lesson unit, and source anchors.
- Add or update tests with behavior changes. Do not rely on manual testing for domain, schema, or persistence behavior.
- Avoid adding abstractions unless they protect a stated boundary: provider swap, database portability, runtime portability, or workflow clarity.
- Avoid broad frontend dependencies. Do not add component suites, state-management libraries, rich text editors, date libraries, or visualization packages without a concrete screen-level need.
- Keep shadcn/ui usage local and explicit. Add one component at a time and review the copied code before modifying it.
- Prioritize phone-width ergonomics for import, review, and study screens; desktop layouts may add density but should not be the only usable path.
- Render Markdown with GFM and LaTeX-style math support, but do not execute MDX or arbitrary embedded code.
- Prefer native controls, route state, local component state, and shared schemas before adding editor, form, or state-management libraries.
- Keep public commands stable. If a tool changes underneath, preserve the command contract or update this file and `docs/SPEC.md`.
- When unsure whether a change belongs in PoC scope, default to the smallest version that proves the guided study workflow.
- Keep `docs/LOOP_LOG.md` current as the running proof-of-work log. Update it when issues are assigned, PRs open, review gates pass/fail, feature videos are recorded, merges happen, or the loop becomes blocked.

When using subagents:

- Give each subagent a concrete, non-overlapping task.
- Assign write ownership when a subagent is expected to edit files.
- Prefer read-only grill/review agents for ambiguous workflow or architecture questions.
- Do not ask multiple agents to edit the same file unless one is explicitly read-only.
- Integrate subagent output deliberately; check it against `docs/SPEC.md`, `CONTEXT.md`, and this contract before keeping it.
- Use `gpt-5.3-codex-spark` with xhigh reasoning for coding subagents unless the user changes the routing.
- Use `gpt-5.5` with xhigh reasoning for code hygiene and security review subagents.
- Use `gpt-5.5` with high reasoning for documentation-agent updater subagents.

## GitHub Workflow

- Use `gh` for repository setup, issue creation, labels, pull requests, and issue state updates.
- Keep handoff/status documentation in `docs/`, but keep actionable issue state in GitHub.
- If `gh` is unavailable or unauthenticated, mark GitHub sync as `needs-human` in the handoff rather than creating a docs issue queue.
- Implementation subagents should open pull requests, not local-only merge requests.
- Code hygiene and security review subagents should leave findings as pull request comments. Use linked GitHub issues only for separable follow-up work that should outlive the PR.
- Documentation subagents should run after code hygiene and security pass, verify `README.md`, `docs/API_CONTRACT.md`, `docs/TEST_CONTRACT.md`, `docs/SPEC.md`, and `docs/HANDOFF.md` remain accurate, make scoped documentation updates directly, and post a summary comment with the commit and verification.
- The GitHub repository should be public for CI credit usage; this is an intentional security-audit constraint.

## Open Questions For User

1. Should self-assessment remain the only grading mode for PoC, or should AI feedback be offered as an optional post-answer helper?
2. Should the app store full source Markdown after Cloudflare deployment, or only local PoC storage plus source anchors?
3. Which OpenAI model should be the initial adapter default?
