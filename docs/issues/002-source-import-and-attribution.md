# Issue 002: Import chapter excerpt with source attribution

State: `ready-for-agent`

## What to build

Allow a user to import a Markdown excerpt for *Deep Learning*, Chapter 17, "Monte Carlo Methods", while preserving source metadata, citation, content hash, and source anchors. The UI must credit the source and the repository must not commit the full chapter text.

## Acceptance criteria

- [ ] Source metadata includes book title, authors, publisher, year, chapter title, source URL, and citation.
- [ ] Markdown import stores content hash and source anchors.
- [ ] Source credit appears in import/review context.
- [ ] Full chapter text is not committed as a fixture.

## Verification

- [ ] Unit tests for source metadata and anchor parsing.
- [ ] Integration test for importing a Markdown excerpt.
- [ ] `bun run typecheck`
- [ ] `bun test`

## Blocked by

- Issue 001

## Likely ownership

- `src/domain/`
- `src/shared/`
- `src/server/db/`
- `src/server/api/`
- `src/app/`
- `tests/unit/`
- `tests/integration/`
