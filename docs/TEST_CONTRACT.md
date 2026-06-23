# Testable Contract

This contract gates the PoC implementation. Do not move issues to `ready-for-agent` unless the relevant behavior below has concrete verification steps.

## Scaffold And Health

Behavior:

- The repository has a Bun-managed Vite React SPA and Hono/Web Fetch API scaffold.
- The app shell renders the Mneme workflow entry point and credits the Chapter 17 source.
- `GET /api/health` returns a stable health response.

Tests:

- Unit: health route returns `{ status: "ok", service: "mneme" }`.
- Build: Vite/TypeScript production build succeeds.
- Runtime smoke: local API and app shell are reachable.

Verification:

- `bun test`
- `bun run typecheck`
- `bun run lint`
- `bun run build`

## Source Attribution

Behavior:

- The app records source metadata for *Deep Learning*, Chapter 17, "Monte Carlo Methods".
- Generated lesson units retain source anchors back to the chapter source.
- Study and review screens display source credit.
- The repository does not commit full chapter text.

Tests:

- Unit: source metadata schema requires title, authors, chapter title, chapter URL, and citation.
- Unit: source anchor parser rejects generated units with missing anchors.
- Integration: importing a Markdown excerpt stores source metadata and content hash.
- Browser: review/study flow displays source credit for an approved unit.

Verification:

- `bun run typecheck`
- `bun test`
- `bun run test:e2e`

## Import And Draft Generation

Behavior:

- A user can import a Markdown excerpt from the chapter.
- A mocked lesson generator can produce a structured lesson draft.
- Invalid generator output is rejected and recorded as a failed generation run.
- Generated content remains draft-only until reviewed.

Tests:

- Unit: generation output schema validates required lesson unit/checkpoint fields.
- Integration: import -> mocked generation creates draft lesson units and checkpoints.
- Integration: invalid mocked generation output does not create studyable units.

Verification:

- `bun run typecheck`
- `bun test`

## Review And Unit Regeneration

Behavior:

- A user can edit, approve, reject, or mark one lesson unit as `needs_regeneration`.
- Regeneration targets a single lesson unit and preserves the rest of the lesson draft.
- Only approved units are studyable.

Tests:

- Unit: review-state transitions enforce allowed states.
- Integration: unit-level regeneration replaces one unit and leaves other unit IDs/content unchanged.
- Browser: review screen can approve one unit and exclude rejected/draft units from study.

Verification:

- `bun run typecheck`
- `bun test`
- `bun run test:e2e`

## Study And Telemetry

Behavior:

- A user studies approved units in order.
- A checkpoint records answer, self-rating, confidence, concept keys, lesson unit, and source anchors.
- Wrong and partial attempts produce queryable weak-concept signals.

Tests:

- Unit: weak-concept derivation maps wrong/partial attempts to concept keys.
- Integration: checkpoint attempt persists telemetry and can be queried by concept.
- Browser: study flow records an attempt and shows it in local history/state.

Verification:

- `bun run typecheck`
- `bun test`
- `bun run test:e2e`

## Repository And Security Gates

Behavior:

- No API keys, `.env` files, full chapter text, or secrets are committed.
- LLM output and Markdown content are treated as untrusted data.
- Markdown rendering supports GFM and math without executing MDX or arbitrary embedded code.

Tests:

- Unit: Markdown rendering/sanitization rejects executable embedded content.
- Review: security pass checks committed files, fixtures, snapshots, and docs for secrets or full chapter text.

Verification:

- `bun run lint`
- `bun run typecheck`
- `bun test`
- security review before merge
