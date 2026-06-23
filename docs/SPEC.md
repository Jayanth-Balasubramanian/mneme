# Spec: AI-Assisted Technical Book Study App

## Objective

Build a local-first web app for studying technical book chapters through AI-assisted guided lessons and checkpoints. The initial user is a CS undergrad working in applied ML: comfortable with mathematical notation, but best served by a strong pairing of formal definitions, intuition, examples, and active recall.

The proof of concept starts with Chapter 17, "Monte Carlo Methods", from Ian Goodfellow, Yoshua Bengio, and Aaron Courville's *Deep Learning* book. The app generates a draft lesson path from a Markdown excerpt of that chapter, lets the user review and edit generated units, then presents approved units as a study flow with checkpoint questions. It records answers, confidence, and correctness signals in SQLite so future versions can generate remediation variants and spaced repetition schedules.

## Confirmed Scope

- Input: one Markdown chapter excerpt supplied by the user.
- First source: *Deep Learning*, Chapter 17, "Monte Carlo Methods", credited in `docs/SOURCES.md`.
- Generation: AI-assisted lesson path with checkpoints, not tiny Anki-only cards.
- Review: generated lesson units must be editable/approvable before study.
- Storage: SQLite for local development.
- AI provider: abstract provider interface, with OpenAI as the initial adapter.
- Scheduling: out of scope for PoC, but store study telemetry to support it later.
- Deployment direction: local first, eventually Cloudflare Workers-compatible.

## Assumptions

1. Single-user app for the PoC; no accounts or multi-tenant data model yet.
2. The user has rights to process the supplied chapter excerpt and understands that OpenAI-backed generation sends selected text to an external provider.
3. The PoC stores source Markdown locally in SQLite to preserve traceability, but the repository should not commit full copyrighted chapter text unless the license/permission is explicit.
4. Checkpoint grading is self-assessed in the PoC: the app shows the expected answer/rubric and records the user's rating. AI grading can be added later.
5. The app should favor correctness, source traceability, and editable output over producing many cards quickly.
6. Exact package versions are pinned when the project is scaffolded; do not guess stale versions in this spec.

## Tech Stack

- Language: TypeScript.
- Package manager and local command runner: Bun.
- Frontend: React with Vite.
- UI system: mobile-first React UI; shadcn/ui components copied into the app as needed. Tailwind can be introduced with the first shadcn component if it earns its dependency cost.
- Backend/API: Hono/Web Fetch API designed to be portable to Cloudflare Workers.
- Local runtime: Bun-driven dev commands with local-only runtime adapters where needed.
- Future edge runtime: Cloudflare Workers.
- Database: SQLite locally, with schema shaped to migrate to Cloudflare D1 later.
- Query layer: repository interfaces over local SQLite for the PoC, with D1-compatible SQL migration shape. Drizzle can be introduced later if the schema and query surface become complex enough to justify the dependency.
- AI integration: provider interface with an OpenAI implementation first.
- Testing: Bun's test runner for unit/integration tests initially; Playwright for browser flow checks when the import/review/study UI exists.
- Frontend posture: mobile-first, clean, minimal, and dependency-light.
- Initial architecture: a single Bun package with a Vite React SPA and Hono API, not a meta-framework.

## Commands

These commands are the expected project interface once the app is scaffolded:

```bash
bun install
bun run dev
bun run build
bun run typecheck
bun run lint
bun test
bun run test:e2e
bun run db:migrate
bun run db:studio
```

The implementation should keep these commands stable even if tools change under the hood. `db:migrate` is active for local SQLite migrations. `test:e2e` is active for the mobile import -> review -> study browser flow. `db:studio` may remain an explicit deferred placeholder until database inspection tooling is introduced.

## API Contract

The implementation must follow `docs/API_CONTRACT.md` for request/response shape, source attribution, validation, and study telemetry behavior.

## Source Attribution

Always credit source material in generated lessons, study screens, exports, fixtures, examples, and documentation. The first source is recorded in `docs/SOURCES.md`.

For the Goodfellow/Bengio/Courville chapter, store source metadata and source anchors in the app. Do not commit the full chapter text into the repository unless reuse rights are confirmed; use user-supplied Markdown excerpts or minimal test fixtures instead.

## Product Flow

### 1. Import Chapter

The user creates a study source by pasting Markdown or uploading a `.md` file. Required metadata:

- Book title.
- Authors.
- Chapter title.
- Source URL.
- Citation text.

Optional metadata:

- Optional chapter number.
- Optional notes about intended emphasis.

The app stores the Markdown, computes a content hash, and derives source anchors from headings and paragraph ranges.

### 2. Generate Lesson Draft

The user requests AI generation for a chapter source. The system sends bounded source chunks to the configured provider and asks for structured output:

- Lesson title and short summary.
- Ordered lesson units.
- Concepts covered by each unit.
- Formal definitions or notation where relevant.
- Intuitive explanation.
- Worked example or analogy when useful.
- Common misconception or trap.
- One or more checkpoint prompts.
- Expected answer and self-grading rubric for each checkpoint.
- Source anchors back to the chapter.

Generation output is stored as a draft, not immediately committed to study.

The PR #9 PoC path supports `provider: "mock"` for validated local draft generation. `provider: "openai"` is part of the request contract for the future live adapter, but it returns `provider_not_supported` until that adapter exists. Invalid generated output, generated anchors that do not match the imported chapter source URL and server-derived anchors, and provider exceptions are recorded as failed generation runs without creating lesson units.

### 3. Review And Edit

Generated lesson units start as `draft`. The review screen shows each generated lesson unit next to bounded source-context snippets derived from the stored Markdown and the unit's source anchors; it must not expose the full chapter Markdown as review context. The user can:

- Edit title, learning objective, explanation, intuition, notation, example, misconception notes, checkpoint prompt, expected answer, and rubric.
- Save reviewer notes.
- Set review status to `draft`, `approved`, `rejected`, or `needs_regeneration`.
- Approve a unit by setting `review_status` to `approved`.
- Reject a unit by setting `review_status` to `rejected`.
- Mark a unit as needing regeneration by setting `review_status` to `needs_regeneration`.
- Add reviewer notes.

Regeneration in v1 targets a single lesson unit. Regenerating a unit preserves the rest of the lesson draft and sends only the selected unit, its concept keys, reviewer notes, source anchors, and bounded source context back through the lesson-generation provider. A successful regeneration must return exactly one replacement unit, validate it with the same generated-output schema and source-anchor provenance checks as initial generation, replace only the selected unit, and reset the replacement to `draft`. Invalid regenerated output, invalid regenerated provenance, or provider errors create a failed generation run and leave every existing lesson unit unchanged.

Only `approved` units appear in the study flow. `draft`, `rejected`, and `needs_regeneration` units remain available for review but are excluded from study.

### 4. Study

The study screen presents approved units in order:

1. Concept title and learning objective.
2. Explanation with formal notation.
3. Intuition or worked example.
4. Checkpoint prompt.
5. User answer.
6. Expected answer and rubric reveal.
7. Self-rating and confidence capture.

Minimum self-rating values:

- `wrong`
- `partial`
- `correct`

Minimum confidence values:

- `low`
- `medium`
- `high`

### 5. Telemetry For Later Remediation

The PoC does not schedule reviews. It must still preserve enough data to later answer:

- Which concepts were missed?
- Which checkpoint prompts failed repeatedly?
- Which explanations were studied before each failed attempt?
- Which source anchors should be used to generate remediation variants?

## Data Model

Initial SQLite tables:

### `chapter_sources`

- `id`
- `book_title`
- `authors_json`
- `publisher`
- `year`
- `chapter_title`
- `chapter_number`
- `source_url`
- `citation_text`
- `emphasis_notes`
- `markdown`
- `content_hash`
- `anchors_json`
- `created_at`
- `updated_at`

### `generation_runs`

- `id`
- `chapter_source_id`
- `provider`
- `model`
- `prompt_version`
- `status`
- `input_summary`
- `raw_output_json`
- `error_message`
- `created_at`

### `lesson_units`

- `id`
- `chapter_source_id`
- `generation_run_id`
- `order_index`
- `title`
- `learning_objective`
- `concept_keys_json`
- `source_anchors_json`
- `explanation_md`
- `intuition_md`
- `notation_md`
- `example_md`
- `misconception_md`
- `review_status`
- `reviewer_notes`
- `created_at`
- `updated_at`

`review_status` values:

- `draft`
- `approved`
- `rejected`
- `needs_regeneration`

### `checkpoints`

- `id`
- `lesson_unit_id`
- `order_index`
- `prompt_md`
- `expected_answer_md`
- `rubric_json`
- `created_at`
- `updated_at`

### `study_attempts`

- `id`
- `checkpoint_id`
- `answer_md`
- `self_rating`
- `confidence`
- `attempted_at`

### `concept_events`

- `id`
- `lesson_unit_id`
- `checkpoint_id`
- `concept_key`
- `event_type`
- `event_payload_json`
- `created_at`

This table gives the future remediation/scheduling system a stable place to record missed concepts and generated variants without rewriting the study attempt model.

## AI Provider Interface

The domain should call an interface, not the OpenAI SDK directly:

```ts
export type GenerateLessonInput = {
  chapterTitle: string;
  bookTitle: string;
  markdown: string;
  learnerProfile: string;
  sourceAnchors: SourceAnchor[];
};

export type LessonDraft = {
  title: string;
  summary: string;
  units: LessonDraftUnit[];
};

export type LessonDraftUnit = {
  title: string;
  learningObjective: string;
  conceptKeys: string[];
  sourceAnchors: SourceAnchor[];
  explanationMd: string;
  intuitionMd: string;
  notationMd?: string;
  exampleMd?: string;
  misconceptionMd?: string;
  checkpoints: Array<{
    promptMd: string;
    expectedAnswerMd: string;
    rubric: Array<{
      rating: "wrong" | "partial" | "correct";
      description: string;
    }>;
  }>;
};

export interface LessonGenerator {
  generate(input: GenerateLessonInput): Promise<LessonDraft>;
}
```

Every provider adapter, including the mock adapter, must validate model output against a schema before saving it. The server must also validate generated source anchors against the imported chapter's stored source URL and paragraph/heading anchors.

## Project Structure

Expected structure after scaffold:

```text
docs/
  SPEC.md
src/
  app/                    # React app shell and routes
  app/components/         # Reusable UI components
  app/routes/             # Import, review, study screens
  server/                 # HTTP handlers and server runtime wiring
  server/api/             # API route handlers
  server/db/              # SQLite connection, migrations, repositories
  server/ai/              # Provider interface, OpenAI adapter, prompts
  domain/                 # Lesson, checkpoint, source, telemetry types
  shared/                 # Shared schemas used by client and server
tests/
  unit/
  integration/
e2e/
  study-flow.spec.ts
migrations/
  *.sql
```

## Frontend Design Constraints

- Build mobile-first. The primary study flow must be comfortable on a phone-width viewport before desktop refinements.
- Use shadcn/ui components only when they serve an actual screen; do not install or copy broad component sets speculatively.
- Prefer native form controls, simple textareas, and focused interactions over heavyweight editors in the PoC.
- Use icons from the chosen icon package only where they make controls clearer.
- Avoid global state libraries unless server state or workflow state becomes demonstrably hard to manage with route state and local component state.
- Keep generated lesson review and study screens dense enough for technical material without turning them into marketing-style card layouts.
- Mathematical notation must render legibly in generated explanations and checkpoints.
- Markdown rendering must support GFM plus LaTeX-style math, without executing MDX or arbitrary embedded code.
- Track bundle impact when adding frontend dependencies; prefer small, composable libraries over broad UI or utility frameworks.

## Dependency Policy

Allowed dependencies when a concrete slice needs them:

- Runtime/framework: `react`, `vite`, `hono`.
- Data and validation: `drizzle-orm`, `drizzle-kit`, `zod`.
- AI: `openai`, behind the provider interface.
- UI styling and components: `tailwindcss`, shadcn-required Radix packages per copied component, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`.
- Markdown/math rendering: `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`.
- Browser testing: `@playwright/test`.

Avoid in the PoC unless explicitly approved:

- Meta-frameworks such as Next or Remix.
- Heavy ORMs such as Prisma or TypeORM.
- AI orchestration frameworks such as LangChain, LlamaIndex, or Vercel AI SDK.
- Heavy editors such as Monaco, CodeMirror, or MDXEditor.
- Global state libraries such as Redux, Zustand, or Jotai.
- Broad component suites such as MUI, Chakra, or Ant Design.
- Framer Motion, chart libraries, and other broad visual dependencies.
- Node-only runtime dependencies outside local adapters.

## Code Style

Prefer small modules with typed inputs and explicit return values. Domain code should not import UI components, HTTP request objects, or provider SDKs.

Example style:

```ts
export async function approveLessonUnit(
  repo: LessonRepository,
  input: { unitId: string; reviewerNotes?: string },
): Promise<LessonUnit> {
  const unit = await repo.findUnitById(input.unitId);

  if (!unit) {
    throw new NotFoundError("lesson_unit", input.unitId);
  }

  return repo.updateUnitReviewStatus({
    unitId: input.unitId,
    reviewStatus: "approved",
    reviewerNotes: input.reviewerNotes ?? unit.reviewerNotes,
  });
}
```

Conventions:

- Use `camelCase` for TypeScript values and object properties.
- Use `snake_case` for database columns.
- Keep provider-specific code under `src/server/ai/`.
- Keep database access behind repositories.
- Validate API inputs with shared schemas before calling domain functions.

## Testing Strategy

### Unit Tests

Use Bun's test runner for:

- Markdown source parsing and source anchor creation.
- Lesson draft schema validation.
- Review status transitions.
- Self-rating and concept event derivation.

### Integration Tests

Use Bun's test runner with a temporary SQLite database for:

- Importing a Markdown chapter.
- Saving a generation run.
- Editing and approving lesson units.
- Recording study attempts.
- Querying weak concepts from attempts.

### Browser Tests

Use Playwright once the UI is implemented for:

- Import chapter -> generate draft -> approve unit -> study checkpoint.
- Review edits persist after reload.
- Attempts appear in study history.

## Boundaries

### Always

- Preserve source traceability for generated lesson units.
- Validate AI output before saving it.
- Store generated content as draft until reviewed.
- Record checkpoint attempts and confidence signals.
- Run typecheck and tests before considering implementation complete.

### Ask First

- Sending full copyrighted chapters to any external model.
- Adding authentication or multi-user support.
- Adding automatic AI grading.
- Adding spaced repetition scheduling.
- Changing the database technology away from SQLite/D1-compatible storage.
- Adding non-OpenAI provider implementations beyond the interface.

### Never

- Commit API keys or book source files containing copyrighted text.
- Treat generated explanations as authoritative without review.
- Store production secrets in client-side code.
- Build PDF/EPUB extraction in the PoC.
- Require Cloudflare deployment for the PoC to work locally.

## Success Criteria

The PoC is successful when:

1. A user can create a chapter source from Markdown.
2. The system can generate a structured lesson draft through the provider interface.
3. Generated units include source anchors, explanation, intuition, notation or formalism where useful, and at least one checkpoint.
4. A user can edit, approve, reject, or mark units for regeneration.
5. Only approved units appear in the study flow.
6. A user can answer checkpoints and record self-rating plus confidence.
7. The database can identify weak concepts from wrong or partial attempts.
8. The app runs locally with SQLite.
9. Unit and integration tests cover the core source -> draft -> review -> study path.

## Initial Implementation Plan

### Phase 1: Foundation

- Scaffold TypeScript app with stable commands.
- Add SQLite schema and migrations.
- Add shared domain types and schemas.
- Add repository layer for chapter sources, generation runs, lesson units, checkpoints, and attempts.

### Phase 2: Source Import And Generation

- Implement Markdown import flow.
- Implement source anchor extraction.
- Implement `LessonGenerator` interface.
- Implement OpenAI adapter with structured output validation.
- Store generation runs and lesson unit drafts.

### Phase 3: Review Workflow

- Build review screen for draft units.
- Support edit, approve, reject, and needs-regeneration states.
- Show source context alongside generated content.
- Add integration tests for review transitions.

### Phase 4: Study Workflow

- Build guided study screen for approved units.
- Capture answers, self-rating, and confidence.
- Record study attempts and concept events.
- Add weak-concept query for future remediation.

### Phase 5: Verification And Cleanup

- Add end-to-end study flow test.
- Confirm local database setup is repeatable.
- Document environment variables and local dev setup.
- Review Cloudflare Workers/D1 migration assumptions.

## Task Breakdown

### Task 1: Scaffold Project

Acceptance:

- `bun run dev`, `bun run build`, `bun run typecheck`, and `bun test` exist.
- App shell renders locally.
- Test runner has one passing smoke test.

Verify:

- `bun run build`
- `bun test`

### Task 2: Add SQLite Schema And Repositories

Acceptance:

- Tables from the data model exist in migrations.
- Repositories can create/read/update chapter sources, lesson units, checkpoints, and attempts.
- Integration tests use an isolated SQLite database.

Verify:

- `bun run db:migrate`
- `bun test`

### Task 3: Implement Markdown Import

Acceptance:

- User can paste or upload Markdown.
- Source metadata is stored.
- Content hash and source anchors are generated.

Verify:

- Import integration test.
- Manual local import.

### Task 4: Implement Lesson Generation Contract

Acceptance:

- Domain depends on `LessonGenerator`, not OpenAI directly.
- Mock provider returns a validated `LessonDraft`; OpenAI remains unsupported until the live adapter lands.
- Invalid provider output is rejected and saved as a failed generation run.
- Provider exceptions are sanitized before being returned or persisted.
- Generated source anchors are rejected unless they match the imported chapter provenance.

Verify:

- Unit tests for schema validation.
- Integration test with mocked provider.

### Task 5: Build Review Workflow

Acceptance:

- Draft units are visible with source context.
- Source context is bounded to review-sized snippets and does not expose full chapter Markdown.
- User can edit generated lesson fields and checkpoint prompt, expected answer, and rubric.
- User can approve, reject, or mark units for regeneration through `draft`, `approved`, `rejected`, and `needs_regeneration` statuses.
- Single-unit regeneration replaces only the selected unit after schema and provenance validation; failed regeneration leaves existing units unchanged.
- Only approved units are eligible for study.

Verify:

- Review integration test.
- Manual local review flow.

### Task 6: Build Study Workflow

Acceptance:

- Approved units render in order.
- User can answer checkpoints.
- Expected answer/rubric can be revealed.
- Self-rating and confidence are stored.

Verify:

- Study attempt integration test.
- Manual local study flow.

### Task 7: Add Weak Concept Query

Acceptance:

- Wrong and partial attempts produce queryable weak concept signals.
- Query returns concept keys with linked source anchors and lesson units.

Verify:

- Unit test for weak concept derivation.
- Integration test over recorded attempts.

### Task 8: Add End-To-End Test And Docs

Acceptance:

- E2E test covers import -> generate mocked draft -> review -> study -> recorded attempt.
- README documents local setup, environment variables, and PoC limits.

Verify:

- `bun run test:e2e`
- `bun run build`
- `bun test`

## Open Questions

1. Should self-assessment remain the only grading mode for PoC, or should AI feedback be offered as an optional post-answer helper?
2. Should the app store full source Markdown after Cloudflare deployment, or only local PoC storage plus source anchors?
3. Which OpenAI model should be the initial adapter default?
