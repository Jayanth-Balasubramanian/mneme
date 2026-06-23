# Issue 001: Scaffold local Bun/Vite/Hono app

State: `ready-for-agent`

## What to build

Create the initial single-package app scaffold using Bun, Vite React SPA, Hono/Web Fetch API, TypeScript, Tailwind/shadcn-ready styling, Drizzle-ready SQLite structure, and the stable command contract from `docs/SPEC.md`.

## Acceptance criteria

- [ ] `bun run dev`, `bun run build`, `bun run typecheck`, `bun run lint`, and `bun test` exist.
- [ ] App shell renders locally.
- [ ] Hono health endpoint exists and is testable.
- [ ] Directory boundaries match `AGENTS.md`.
- [ ] `.gitignore` excludes secrets, local databases, build outputs, and dependency folders.

## Verification

- [ ] `bun run build`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun test`

## Blocked by

None - can start immediately.

## Likely ownership

- `package.json`
- `bun.lock`
- `src/app/`
- `src/server/`
- `src/domain/`
- `src/shared/`
- `tests/unit/`
- config files
