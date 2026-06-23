# Issue 005: Study approved units and record telemetry

State: `ready-for-agent`

## What to build

Build the guided study flow for approved lesson units and record checkpoint attempts with self-rating, confidence, concept keys, lesson unit, and source anchors. Wrong and partial attempts must produce weak-concept signals for future remediation.

## Acceptance criteria

- [ ] Study flow renders approved units in order.
- [ ] Checkpoint answer, self-rating, and confidence are stored.
- [ ] Attempts link back to checkpoint, lesson unit, concept keys, and source anchors.
- [ ] Weak concepts can be queried from wrong and partial attempts.
- [ ] Study screen displays source credit.

## Verification

- [ ] Unit test for weak-concept derivation.
- [ ] Integration test for recording a checkpoint attempt.
- [ ] Browser test for study -> answer -> reveal rubric -> record attempt.
- [ ] `bun run typecheck`
- [ ] `bun test`
- [ ] `bun run test:e2e`

## Blocked by

- Issue 004

## Likely ownership

- `src/domain/`
- `src/shared/`
- `src/server/api/`
- `src/server/db/`
- `src/app/`
- `tests/unit/`
- `tests/integration/`
- `e2e/`
