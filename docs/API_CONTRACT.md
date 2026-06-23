# API Contract

This is the intended PoC API surface. It is a contract for implementation and tests, not a generated OpenAPI file yet.

Base path: `/api`

All request bodies and responses must be validated with shared schemas. Markdown and LLM output are untrusted data.

## `GET /api/health`

Return a stable local runtime health response.

Response:

```ts
type HealthResponse = {
  status: "ok";
  service: "mneme";
};
```

Verification:

- Unit: route returns HTTP 200 with the stable response.
- Runtime smoke: local API responds at `/api/health`.

## Source Metadata

The first source is:

- Book: *Deep Learning*
- Authors: Ian Goodfellow, Yoshua Bengio, and Aaron Courville
- Chapter: Chapter 17, "Monte Carlo Methods"
- URL: <https://www.deeplearningbook.org/contents/monte_carlo.html>
- Citation: see `docs/SOURCES.md`

Every response that exposes generated or study content should include enough source metadata for the UI to credit the source.

## `POST /api/chapter-sources`

Create a chapter source from user-supplied Markdown.

Request:

```ts
type CreateChapterSourceRequest = {
  bookTitle: string;
  authors: string[];
  publisher?: string;
  year?: number;
  chapterTitle: string;
  chapterNumber?: string;
  sourceUrl: string;
  citationText: string;
  markdown: string;
  emphasisNotes?: string;
};
```

Response:

```ts
type ChapterSourceResponse = {
  id: string;
  bookTitle: string;
  authors: string[];
  publisher?: string;
  year?: number;
  chapterTitle: string;
  chapterNumber?: string;
  sourceUrl: string;
  citationText: string;
  emphasisNotes?: string;
  contentHash: string;
  anchors: SourceAnchor[];
  sourceCredit: SourceCredit;
  createdAt: string;
  updatedAt: string;
};
```

Success status: `201 Created`.

Error responses:

```ts
type InvalidJsonResponse = {
  error: "invalid_json";
  issues: ValidationIssue[];
};

type ValidationFailedResponse = {
  error: "validation_failed";
  issues: ValidationIssue[];
};

type ChapterSourceCreateFailedResponse = {
  error: "chapter_source_create_failed";
};
```

Error status codes:

- `400 invalid_json` when the request body is not valid JSON.
- `400 validation_failed` when required source metadata, source URL, Markdown, or usable source anchors are missing/invalid.
- `500 chapter_source_create_failed` when the repository cannot persist the source.

Verification:

- Reject empty Markdown.
- Reject missing title, authors, source URL, or citation.
- Persist emphasis notes, content hash, and anchors.
- Do not require committing source text to the repository.

## `POST /api/generation-runs`

Generate a lesson draft from a chapter source. The PoC implementation should support a mocked provider first; live OpenAI is an adapter behind the provider interface.

Request:

```ts
type CreateGenerationRunRequest = {
  chapterSourceId: string;
  provider: "mock" | "openai";
  learnerProfile: string;
};
```

Implemented provider behavior for PR #9:

- `provider: "mock"` is the only supported successful provider path.
- `provider: "openai"` is accepted by the request schema but returns `400 provider_not_supported` until the live adapter is implemented; it must not silently fall through to the mock generator.
- Unknown provider names return `400 validation_failed`.
- A missing chapter source returns `404 chapter_source_not_found`.
- Generator exceptions are stored as failed generation runs with the sanitized `generation_provider_failed` message. Raw exception details, secrets, or provider stack traces must not be returned or persisted as generation output.

Response:

```ts
type GenerationRunResponse = {
  id: string;
  chapterSourceId: string;
  provider: string;
  model?: string;
  promptVersion: string;
  status: "succeeded" | "failed";
  lessonUnitIds: string[];
  errorMessage?: string;
  createdAt: string;
};
```

Success and failure statuses:

- `201 Created` with `status: "succeeded"` when validated mock output is saved.
- `201 Created` with `status: "failed"` when the provider returns invalid output, invalid provenance anchors, or throws; failed runs must have `lessonUnitIds: []`.
- `400 invalid_json` when the request body is not valid JSON.
- `400 validation_failed` when the request shape is invalid.
- `400 provider_not_supported` when `provider: "openai"` is requested before the adapter exists.
- `404 chapter_source_not_found` when `chapterSourceId` does not exist.

Generated draft contract:

```ts
type LessonGenerationDraft = {
  title: string;
  summary: string;
  units: LessonGenerationUnit[];
};

type LessonGenerationUnit = {
  title: string;
  learningObjective: string;
  conceptKeys: string[];
  sourceAnchors: SourceAnchor[];
  explanationMd: string;
  intuitionMd: string;
  notationMd?: string;
  exampleMd?: string;
  misconceptionMd?: string;
  checkpoints: LessonGenerationCheckpoint[];
};

type LessonGenerationCheckpoint = {
  promptMd: string;
  expectedAnswerMd: string;
  rubric: Array<{
    rating: "wrong" | "partial" | "correct";
    description: string;
  }>;
};
```

Persistence contract:

- Successful generation stores one `generation_runs` row with raw provider output for debugging, then stores each generated unit as `reviewStatus: "draft"`.
- Each generated unit stores ordered checkpoints with prompt, expected answer, and self-assessment rubric.
- Every unit must have at least one non-empty concept key, at least one checkpoint, and at least one source anchor.
- `conceptKeys` and `sourceAnchors[].headingPath` arrays are strict: mixed valid/invalid entries fail the whole generated draft instead of being silently filtered.
- Generated source anchors must match the imported chapter source URL and server-derived paragraph/heading anchors before persistence.
- Failed generation runs do not create lesson units or checkpoints.

Verification:

- Validate generated lesson output before saving lesson units.
- Save failed generation runs without creating studyable units.
- Store source anchors for every generated lesson unit.
- Reject malformed concept key arrays and malformed heading path arrays.
- Reject generated anchors with a foreign source URL or paragraph range/heading path outside the imported chapter anchors.
- Reject `provider: "openai"` until the live adapter is implemented.
- Sanitize provider exception details in API responses and persisted generation failure output.

## `GET /api/lesson-units?chapterSourceId=:id`

List lesson units for a chapter source.

Optional query params:

```ts
type LessonUnitListQuery = {
  chapterSourceId: string;
  reviewStatus?: "draft" | "approved" | "rejected" | "needs_regeneration";
};
```

Response:

```ts
type LessonUnitListResponse = {
  units: LessonUnitResponse[];
};
```

Lesson-unit responses include bounded `sourceContext` snippets derived from the stored chapter Markdown and the unit's `sourceAnchors`. The API must return only review-sized snippets around matched anchors, not the full chapter Markdown or unbounded source dumps.

## `PATCH /api/lesson-units/:id`

Edit generated lesson unit content, checkpoint content, and review state. Generated units start as `draft`; the review workflow may set any stored unit to `draft`, `approved`, `rejected`, or `needs_regeneration`. The study path consumes only `approved` units.

Request:

```ts
type UpdateCheckpointPatch = {
  checkpointId: string;
  promptMd?: string;
  expectedAnswerMd?: string;
  rubric?: Array<{
    rating: "wrong" | "partial" | "correct";
    description: string;
  }>;
};

type UpdateLessonUnitRequest = {
  title?: string;
  learningObjective?: string;
  explanationMd?: string;
  intuitionMd?: string;
  notationMd?: string;
  exampleMd?: string;
  misconceptionMd?: string;
  checkpointPatches?: UpdateCheckpointPatch[];
  checkpointReplacements?: LessonGenerationCheckpoint[];
  reviewerNotes?: string;
  reviewStatus?: "draft" | "approved" | "rejected" | "needs_regeneration";
};
```

Response:

```ts
type LessonUnitResponse = {
  id: string;
  chapterSourceId: string;
  generationRunId: string;
  orderIndex: number;
  title: string;
  learningObjective: string;
  conceptKeys: string[];
  sourceAnchors: SourceAnchor[];
  explanationMd: string;
  intuitionMd: string;
  notationMd?: string;
  exampleMd?: string;
  misconceptionMd?: string;
  reviewStatus: "draft" | "approved" | "rejected" | "needs_regeneration";
  reviewerNotes?: string;
  checkpoints: CheckpointResponse[];
  sourceContext?: SourceContextSnippet[];
  sourceCredit: SourceCredit;
};

type SourceContextSnippet = {
  paragraphIndex: number;
  headingPath: string[];
  text: string;
};
```

Validation:

- Reject missing `chapterSourceId`.
- Reject unsupported `reviewStatus` values with `validation_failed`.
- Reject PATCH bodies that provide both `checkpointPatches` and `checkpointReplacements`.
- Reject empty checkpoint patch/replacement arrays and malformed rubric ratings.

Verification:

- Only approved units are returned to study endpoints.
- Review status updates support `draft`, `approved`, `rejected`, and `needs_regeneration`; unsupported statuses return `validation_failed`.
- `draft`, `rejected`, and `needs_regeneration` units remain reviewable but are excluded from study endpoints.
- Edited checkpoint prompt, expected answer, and rubric content persist into approved study paths.
- Lesson-unit list responses include bounded source-context snippets for review.

## `POST /api/lesson-units/:id/regenerate`

Regenerate exactly one lesson unit. The regeneration request uses the selected unit's existing concept keys, source anchors, reviewer notes, and bounded source context. A successful response replaces only the selected unit, stores a succeeded generation run, and returns the replacement as `reviewStatus: "draft"` so it must still be reviewed before study.

Request:

```ts
type RegenerateLessonUnitRequest = {
  reviewerNotes?: string;
  provider: "mock" | "openai";
};
```

Response:

```ts
type RegenerateLessonUnitResponse = {
  replacedUnitId: string;
  lessonUnit: LessonUnitResponse;
  generationRunId: string;
};
```

Status and error responses:

- `200 OK` when the selected unit is replaced by one validated regenerated unit.
- `400 invalid_json` when the request body is not valid JSON.
- `400 validation_failed` when the request shape is invalid.
- `400 provider_not_supported` when `provider: "openai"` is requested before the adapter exists.
- `400 generation_validation_failed` when regenerated output is malformed, returns anything other than one unit, or has invalid source-anchor provenance.
- `404 lesson_unit_not_found` when the selected unit does not exist.
- `404 chapter_source_not_found` when the original unit's source no longer exists.
- `502 generation_failed` when the provider throws; provider exception details must be sanitized.

Verification:

- Preserve all other lesson units in the draft.
- Use the original unit's concept keys, source anchors, source context, and reviewer notes.
- Validate regenerated provider output with the same generated-output and provenance checks as initial generation before saving a successful generation run or replacing the unit.
- Require exactly one regenerated unit before replacement.
- Save invalid regenerated output, invalid regenerated anchors, and provider exceptions as failed generation runs with sanitized error text, leaving the existing unit and every other unit unchanged.

## `GET /api/study-paths/:chapterSourceId`

Return approved lesson units in study order.

Response:

```ts
type StudyPathResponse = {
  chapterSourceId: string;
  sourceCredit: SourceCredit;
  units: LessonUnitResponse[];
};
```

Verification:

- Exclude draft, rejected, and needs-regeneration units.
- Preserve order.

## `POST /api/study-attempts`

Record a checkpoint attempt.

Request:

```ts
type CreateStudyAttemptRequest = {
  checkpointId: string;
  answerMd: string;
  selfRating: "wrong" | "partial" | "correct";
  confidence: "low" | "medium" | "high";
};
```

Response:

```ts
type StudyAttemptResponse = {
  id: string;
  checkpointId: string;
  lessonUnitId: string;
  conceptKeys: string[];
  sourceAnchors: SourceAnchor[];
  selfRating: "wrong" | "partial" | "correct";
  confidence: "low" | "medium" | "high";
  attemptedAt: string;
};
```

Success and error statuses:

- `201 Created` when the checkpoint belongs to an approved lesson unit and the attempt is recorded.
- `400 invalid_json` when the request body is not valid JSON.
- `400 validation_failed` when `checkpointId`, `answerMd`, `selfRating`, or `confidence` is missing or invalid.
- `404 checkpoint_not_found` when the checkpoint does not exist or belongs to a lesson unit that is not approved for study.
- `500 study_attempt_failed` when the repository cannot persist the attempt.

Verification:

- Only approved-unit checkpoints can receive attempts.
- Store enough data to query weak concepts.
- Wrong and partial ratings emit weak-concept events.
- Correct ratings are stored as attempts without weak-concept events.

## `GET /api/weak-concepts?chapterSourceId=:id`

Return concepts with wrong or partial attempts.

Response:

```ts
type WeakConceptsResponse = {
  concepts: Array<{
    conceptKey: string;
    attempts: number;
    latestAttemptAt: string;
    lessonUnitIds: string[];
    sourceAnchors: SourceAnchor[];
  }>;
};
```

Success and error statuses:

- `200 OK` with `concepts: []` when the chapter source exists but has no wrong or partial attempts.
- `400 validation_failed` when `chapterSourceId` is omitted or blank.
- `404 chapter_source_not_found` when the chapter source does not exist.
- `500 weak_concepts_query_failed` when weak-concept events cannot be queried.

Behavior:

- Aggregates weak-concept events by `conceptKey`.
- Counts wrong and partial attempt events only.
- Includes linked lesson unit IDs and source anchors so remediation can trace back to the approved unit and credited source.
- Sorts concepts by latest weak attempt descending, then concept key.

## Shared Types

```ts
type SourceAnchor = {
  headingPath: string[];
  paragraphStart: number;
  paragraphEnd: number;
  sourceUrl: string;
};

type SourceCredit = {
  title: string;
  authors: string[];
  publisher?: string;
  year?: number;
  chapterTitle: string;
  chapterNumber?: string;
  sourceUrl: string;
  citationText: string;
};

type CheckpointResponse = {
  id: string;
  lessonUnitId: string;
  orderIndex: number;
  promptMd: string;
  expectedAnswerMd: string;
  rubric: Array<{
    rating: "wrong" | "partial" | "correct";
    description: string;
  }>;
};
```
