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
- Unit: source anchor parser rejects imported Markdown that cannot produce usable anchors.
- Integration: importing a Markdown excerpt stores source metadata and content hash.
- UI/import: the import result displays source credit for the saved excerpt. This is manually covered by build/runtime review until browser automation is added.
- Browser, after review/study lands: review/study flow displays source credit for an approved unit.

Verification:

- `bun run typecheck`
- `bun test`
- `bun run build`

## Import And Draft Generation

Behavior:

- A user can import a Markdown excerpt from the chapter.
- A mocked lesson generator can produce a structured lesson draft with draft units, source anchors, and checkpoints.
- `provider: "mock"` is the only supported successful provider path until a live adapter lands.
- `provider: "openai"` returns `provider_not_supported` instead of using the mock provider.
- Invalid generator output is rejected and recorded as a failed generation run.
- Generated source anchors must match the imported chapter source URL and server-derived paragraph/heading anchors.
- Provider exceptions are sanitized before they are returned or persisted.
- Generated content remains draft-only until reviewed.

Tests:

- Unit: generation request schema accepts valid mock generation requests.
- Unit: generation output schema validates required lesson unit/checkpoint fields.
- Unit: generation output schema rejects missing concept keys, missing source anchors, malformed concept key arrays, and malformed heading path arrays.
- Integration: import -> mocked generation creates draft lesson units and checkpoints.
- Integration: invalid mocked generation output creates a failed generation run and does not create studyable units.
- Integration: unsupported `openai` provider requests return `provider_not_supported`.
- Integration: generated anchors with a foreign source URL or impossible paragraph range create failed generation runs and do not persist lesson units.
- Integration: thrown provider errors are stored with `generation_provider_failed` and do not expose raw exception details.

Verification:

- `bun run typecheck`
- `bun test`

## Review And Unit Regeneration

Behavior:

- A user can edit, approve, reject, or mark one lesson unit as `needs_regeneration`.
- A user can edit checkpoint prompt, expected answer, and rubric content before approval.
- Review responses and the review UI include bounded source context derived from stored chapter Markdown and source anchors, without returning or displaying full chapter dumps.
- Regeneration targets a single lesson unit and preserves the rest of the lesson draft.
- Regeneration validates provider output and source-anchor provenance before replacing the unit, and successful replacement returns to `draft` review state.
- Only approved units are studyable.

Tests:

- Unit: checkpoint patch/replacement request schemas validate editable checkpoint content.
- Unit: review-state transitions enforce allowed states.
- Unit: source-context extraction returns a bounded paragraph window around anchors.
- Integration: lesson-unit responses include bounded source-context snippets.
- Integration: checkpoint edits survive save and approval into the study path.
- Integration: unit-level regeneration replaces one unit as a draft and leaves other unit IDs/content unchanged.
- Integration: invalid regenerated output and invalid regenerated anchors save failed generation runs and leave the existing unit plus all other units unchanged.
- Browser: review screen can approve one unit and exclude rejected/draft units from study.

Verification:

- `bun run typecheck`
- `bun test`
- `bun run test:e2e`

Notes:

- `bun run test:e2e` runs the mobile import -> mock generation -> approval -> study checkpoint attempt browser flow against a temporary SQLite database.

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

Note:

- `test:e2e` validates the visible study transition states with browser DOM interactions and checks that a wrong or partial checkpoint attempt creates weak-concept feedback.

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
