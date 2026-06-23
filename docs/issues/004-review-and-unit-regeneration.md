# Issue 004: Review lesson units and regenerate a single unit

State: `ready-for-agent`

## What to build

Build the review workflow for generated lesson units. Users can edit, approve, reject, or mark a unit for regeneration. Regeneration targets exactly one lesson unit and preserves the rest of the lesson draft.

## Acceptance criteria

- [ ] Review status transitions support `draft`, `approved`, `rejected`, and `needs_regeneration`.
- [ ] A user can edit generated content before approving it.
- [ ] Regenerating a unit replaces only that unit.
- [ ] Only approved units are available to the study flow.
- [ ] Review screen displays source credit and source context.

## Verification

- [ ] Unit tests for review-state transitions.
- [ ] Integration test for unit-level regeneration preserving other units.
- [ ] Browser test for approve/reject/edit flow.
- [ ] `bun run typecheck`
- [ ] `bun test`
- [ ] `bun run test:e2e`

## Blocked by

- Issue 002
- Issue 003

## Likely ownership

- `src/domain/`
- `src/shared/`
- `src/server/api/`
- `src/server/db/`
- `src/app/`
- `tests/unit/`
- `tests/integration/`
- `e2e/`
