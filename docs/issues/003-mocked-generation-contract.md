# Issue 003: Generate validated lesson drafts with a mocked provider

State: `ready-for-agent`

## What to build

Implement the lesson-generation contract using a mocked provider first. The system should validate generated lesson draft output and save generation runs without requiring a live OpenAI call.

## Acceptance criteria

- [ ] Domain depends on a `LessonGenerator` interface.
- [ ] Shared schema validates lesson units, checkpoints, concept keys, and source anchors.
- [ ] Mocked provider creates draft lesson units and checkpoints from an imported excerpt.
- [ ] Invalid provider output is rejected and recorded as a failed generation run.

## Verification

- [ ] Unit tests for generated output schema validation.
- [ ] Integration test for import -> mocked generation -> draft units.
- [ ] Integration test for invalid generation output.
- [ ] `bun run typecheck`
- [ ] `bun test`

## Blocked by

- Issue 001

## Likely ownership

- `src/domain/`
- `src/shared/`
- `src/server/ai/`
- `src/server/db/`
- `tests/unit/`
- `tests/integration/`
