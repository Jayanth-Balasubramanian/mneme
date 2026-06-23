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

Verification:

- Validate generated lesson output before saving lesson units.
- Save failed generation runs without creating studyable units.
- Store source anchors for every generated lesson unit.

## `GET /api/lesson-units?chapterSourceId=:id`

List lesson units for a chapter source.

Response:

```ts
type LessonUnitListResponse = {
  units: LessonUnitResponse[];
};
```

## `PATCH /api/lesson-units/:id`

Edit generated lesson unit content and review state.

Request:

```ts
type UpdateLessonUnitRequest = {
  title?: string;
  learningObjective?: string;
  explanationMd?: string;
  intuitionMd?: string;
  notationMd?: string;
  exampleMd?: string;
  misconceptionMd?: string;
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
  sourceCredit: SourceCredit;
};
```

Verification:

- Only approved units are returned to study endpoints.
- Review state transitions are tested.

## `POST /api/lesson-units/:id/regenerate`

Regenerate exactly one lesson unit.

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

Verification:

- Preserve all other lesson units in the draft.
- Use the original unit's concept keys, source anchors, source context, and reviewer notes.

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

Verification:

- Store enough data to query weak concepts.
- Wrong and partial ratings emit weak-concept events.

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
