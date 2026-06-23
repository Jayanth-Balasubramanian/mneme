# Handoff

## Current State

This repository is initialized locally and contains planning/contract documentation for a local-first AI-assisted study app. The implementation has not been scaffolded yet.

Git:

- Branch: `main`
- Initial commit: `1b365db docs: initialize study app planning loop`
- Remote: not configured

GitHub:

- GitHub CLI is installed.
- GitHub CLI authentication is not complete.
- Repository creation, issue creation, and pull request workflow are blocked until `gh auth login --git-protocol ssh --web --skip-ssh-key` succeeds.

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
- Drizzle over local SQLite with D1-compatible schema direction
- shadcn/ui and Tailwind, copied selectively
- OpenAI behind a provider interface, mocked provider first

Workflow:

- GitHub issues are the issue queue.
- GitHub pull requests are the review/merge surface.
- No issue files should live under `docs/`.
- Use rebase-only integration.
- At most two implementation agents should run in parallel.

## GitHub Issues To Create

Create these as GitHub issues after repository setup. Each should include acceptance criteria and verification commands from `docs/TEST_CONTRACT.md` and `docs/API_CONTRACT.md`.

1. Scaffold local Bun/Vite/Hono app
   - State: `ready-for-agent`
   - Blocked by: none
   - Owns: package/config, initial app/server folders, smoke tests

2. Import chapter excerpt with source attribution
   - State: `ready-for-agent`
   - Blocked by: issue 1
   - Owns: source metadata, source anchors, import flow, attribution display

3. Generate validated lesson drafts with a mocked provider
   - State: `ready-for-agent`
   - Blocked by: issue 1
   - Owns: `LessonGenerator` contract, output validation, generation runs

4. Review lesson units and regenerate a single unit
   - State: `ready-for-agent`
   - Blocked by: issues 2 and 3
   - Owns: review states, editing, approving/rejecting, single-unit regeneration

5. Study approved units and record telemetry
   - State: `ready-for-agent`
   - Blocked by: issue 4
   - Owns: study path, attempts, weak-concept query

## Remaining Human Inputs

1. Complete GitHub CLI auth.
2. Confirm repository owner/name/visibility if not using default private repo named after this directory.
3. Decide whether self-assessment remains the only PoC grading mode, or whether optional post-answer AI feedback is allowed.
4. Decide whether deployed Cloudflare storage may retain full source Markdown, or whether full source text remains local-only.
5. Choose the initial OpenAI model for the live adapter.
