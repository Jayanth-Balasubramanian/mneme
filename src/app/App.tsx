import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import type {
  ChapterSourceResponse,
  CreateChapterSourceRequest,
  SourceCredit,
  ValidationIssue,
} from "../shared/source";
import type {
  CreateGenerationRunRequest,
  GenerationRunResponse,
  LessonUnitResponse,
  RegenerateLessonUnitRequest,
  ReviewStatus,
  UpdateLessonUnitRequest,
} from "../shared/generation";

type HealthState = "checking" | "online" | "offline";
type ImportState = "idle" | "submitting" | "succeeded" | "failed";
type GenerationState = "idle" | "submitting" | "succeeded" | "failed";

type ImportFormState = {
  bookTitle: string;
  authorsText: string;
  publisher: string;
  year: string;
  chapterTitle: string;
  chapterNumber: string;
  sourceUrl: string;
  citationText: string;
  emphasisNotes: string;
  markdown: string;
};

type LessonUnitDraft = {
  title: string;
  learningObjective: string;
  explanationMd: string;
  intuitionMd: string;
  notationMd: string;
  exampleMd: string;
  misconceptionMd: string;
  reviewerNotes: string;
  reviewStatus: ReviewStatus;
};

const deepLearningDefaults: ImportFormState = {
  bookTitle: "Deep Learning",
  authorsText: "Ian Goodfellow, Yoshua Bengio, Aaron Courville",
  publisher: "MIT Press",
  year: "2016",
  chapterTitle: "Monte Carlo Methods",
  chapterNumber: "17",
  sourceUrl: "https://www.deeplearningbook.org/contents/monte_carlo.html",
  citationText:
    "Ian Goodfellow, Yoshua Bengio, and Aaron Courville, Deep Learning, MIT Press, 2016. http://www.deeplearningbook.org",
  emphasisNotes:
    "Pair formal definitions with intuition for a CS undergrad working in applied ML.",
  markdown: "",
};

const reviewStatusOptions: ReviewStatus[] = [
  "draft",
  "approved",
  "rejected",
  "needs_regeneration",
];

function buildWorkflowItems(
  source: ChapterSourceResponse | null,
  units: LessonUnitResponse[],
) {
  const approvedUnits = units.filter((unit) => unit.reviewStatus === "approved");

  return [
    { label: "Import", status: source ? "Imported" : "No excerpt" },
    {
      label: "Generate",
      status: source
        ? units.length > 0
          ? "Generated"
          : "Waiting"
        : "Blocked",
    },
    {
      label: "Review",
      status: units.length > 0 ? `${units.length} unit(s)` : "Waiting",
    },
    {
      label: "Study",
      status:
        approvedUnits.length > 0 ? `${approvedUnits.length} approved` : "Waiting",
    },
  ] as const;
}

function toLessonUnitDraft(unit: LessonUnitResponse): LessonUnitDraft {
  return {
    title: unit.title,
    learningObjective: unit.learningObjective,
    explanationMd: unit.explanationMd,
    intuitionMd: unit.intuitionMd,
    notationMd: unit.notationMd ?? "",
    exampleMd: unit.exampleMd ?? "",
    misconceptionMd: unit.misconceptionMd ?? "",
    reviewerNotes: unit.reviewerNotes ?? "",
    reviewStatus: unit.reviewStatus,
  };
}

function useHealthState(): HealthState {
  const [healthState, setHealthState] = useState<HealthState>("checking");

  useEffect(() => {
    let isMounted = true;

    async function checkHealth(): Promise<void> {
      try {
        const response = await fetch("/api/health");

        if (!isMounted) {
          return;
        }

        setHealthState(response.ok ? "online" : "offline");
      } catch {
        if (isMounted) {
          setHealthState("offline");
        }
      }
    }

    void checkHealth();

    return () => {
      isMounted = false;
    };
  }, []);

  return healthState;
}

function formatAuthors(authors: string[]): string {
  return new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  }).format(authors);
}

function formatChapterHeading(source: ChapterSourceResponse): string {
  return source.chapterNumber
    ? `${source.bookTitle}, Chapter ${source.chapterNumber}`
    : `${source.bookTitle}: ${source.chapterTitle}`;
}

function formatSourceCredit(source: ChapterSourceResponse): string {
  const chapterLabel = source.chapterNumber
    ? `Chapter ${source.chapterNumber}: `
    : "";

  return `${source.bookTitle}, ${chapterLabel}${source.chapterTitle}`;
}

function formatSourceCreditForUnit(source: SourceCredit): string {
  const chapterLabel = source.chapterNumber
    ? `Chapter ${source.chapterNumber}: `
    : "";

  return `${source.title}, ${chapterLabel}${source.chapterTitle}`;
}

function buildImportPayload(
  formState: ImportFormState,
): CreateChapterSourceRequest {
  const authors = formState.authorsText
    .split(",")
    .map((author) => author.trim())
    .filter((author) => author.length > 0);
  const year = Number.parseInt(formState.year, 10);

  return {
    bookTitle: formState.bookTitle,
    authors,
    publisher: formState.publisher || undefined,
    year: Number.isNaN(year) ? undefined : year,
    chapterTitle: formState.chapterTitle,
    chapterNumber: formState.chapterNumber || undefined,
    sourceUrl: formState.sourceUrl,
    citationText: formState.citationText,
    markdown: formState.markdown,
    emphasisNotes: formState.emphasisNotes || undefined,
  };
}

function parseResponseMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null || !("issues" in body)) {
    return fallback;
  }

  const issues = (body as { issues?: unknown }).issues;

  if (!Array.isArray(issues)) {
    return fallback;
  }

  const message = issues
    .filter((issue): issue is ValidationIssue => {
      return (
        typeof issue === "object" &&
        issue !== null &&
        "field" in issue &&
        "message" in issue &&
        typeof issue.field === "string" &&
        typeof issue.message === "string"
      );
    })
    .map((issue) => `${issue.field}: ${issue.message}`)
    .join(" ");

  return message.length > 0
    ? message
    : fallback;
}

function formatSourceAnchors(units: LessonUnitResponse): string {
  return units.sourceAnchors
    .map((anchor) => {
      const heading = anchor.headingPath.length > 0
        ? anchor.headingPath.join(" » ")
        : "Untitled section";

      return `${heading} (paragraph ${anchor.paragraphStart}-${anchor.paragraphEnd})`;
    })
    .join("; ");
}

function buildUnitPayload(draft: LessonUnitDraft): UpdateLessonUnitRequest {
  return {
    title: draft.title,
    learningObjective: draft.learningObjective,
    explanationMd: draft.explanationMd,
    intuitionMd: draft.intuitionMd,
    notationMd: draft.notationMd,
    exampleMd: draft.exampleMd,
    misconceptionMd: draft.misconceptionMd,
    reviewerNotes: draft.reviewerNotes,
    reviewStatus: draft.reviewStatus,
  };
}

export function App() {
  const healthState = useHealthState();
  const [formState, setFormState] =
    useState<ImportFormState>(deepLearningDefaults);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [generationState, setGenerationState] = useState<GenerationState>(
    "idle",
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<string>(
    "No draft yet",
  );
  const [approvedStudyUnits, setApprovedStudyUnits] = useState<LessonUnitResponse[]>(
    [],
  );
  const [chapterSource, setChapterSource] =
    useState<ChapterSourceResponse | null>(null);
  const [lessonUnits, setLessonUnits] = useState<LessonUnitResponse[]>([]);
  const [editDrafts, setEditDrafts] = useState<Record<string, LessonUnitDraft>>(
    {},
  );
  const [reviewError, setReviewError] = useState<string | null>(null);

  const workflowItems = useMemo(
    () => buildWorkflowItems(chapterSource, lessonUnits),
    [chapterSource, lessonUnits],
  );

  const approvedUnitCount = approvedStudyUnits.length;
  function updateField(field: keyof ImportFormState, value: string): void {
    setFormState((current) => ({ ...current, [field]: value }));
  }

  function setDraftField<Field extends keyof LessonUnitDraft>(
    unitId: string,
    field: Field,
    value: LessonUnitDraft[Field],
  ): void {
    setEditDrafts((current) => ({
      ...current,
      [unitId]: {
        ...current[unitId],
        [field]: value,
      },
    }));
  }

  async function loadLessonUnits(sourceId: string): Promise<void> {
    const response = await fetch(
      `/api/lesson-units?chapterSourceId=${sourceId}`,
    );
    const body = await response.json();

    if (!response.ok) {
      setGenerationError(
        parseResponseMessage(
          body,
          "Failed to load lesson units for the current chapter.",
        ),
      );
      return;
    }

    const units = (body.units as LessonUnitResponse[]) ?? [];
    setLessonUnits(units);

    const nextDrafts: Record<string, LessonUnitDraft> = {};
    for (const unit of units) {
      nextDrafts[unit.id] = toLessonUnitDraft(unit);
    }

    setEditDrafts(nextDrafts);
    await loadApprovedStudyUnits(sourceId);
  }

  async function loadApprovedStudyUnits(sourceId: string): Promise<void> {
    const response = await fetch(`/api/study-paths/${sourceId}`);
    const body = await response.json();

    if (!response.ok) {
      setApprovedStudyUnits([]);
      return;
    }

    setApprovedStudyUnits((body.units as LessonUnitResponse[]) ?? []);
  }

  async function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.currentTarget.files?.[0];

    if (!file) {
      return;
    }

    updateField("markdown", await file.text());
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setImportState("submitting");
    setImportError(null);

    try {
      const response = await fetch("/api/chapter-sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildImportPayload(formState)),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        setImportState("failed");
        setImportError(
          parseResponseMessage(
            body,
            "Import failed. Check the source metadata and excerpt.",
          ),
        );
        return;
      }

      const created = body as ChapterSourceResponse;
      setChapterSource(created);
      setLessonUnits([]);
      setEditDrafts({});
      setApprovedStudyUnits([]);
      setImportState("succeeded");
      await loadLessonUnits(created.id);
    } catch {
      setImportState("failed");
      setImportError("Import failed because the local API is unreachable.");
    }
  }

  async function generateLessonDraft(): Promise<void> {
    if (!chapterSource) {
      return;
    }

    setGenerationState("submitting");
    setGenerationError(null);
    setGenerationStatus("Generating draft lesson units...");

    try {
      const request: CreateGenerationRunRequest = {
        chapterSourceId: chapterSource.id,
        provider: "mock",
        learnerProfile:
          "CS undergraduate with applied ML background; prefer formal definitions with intuition.",
      };
      const response = await fetch("/api/generation-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const body = await response.json();

      const status = (body as GenerationRunResponse).status;
      setGenerationStatus(
        status === "failed"
          ? "Generation failed. See response status."
          : "Draft generation succeeded.",
      );

      if (!response.ok || status === "failed") {
        setGenerationError(
          parseResponseMessage(
            body,
            "Lesson draft generation failed.",
          ),
        );
        setGenerationState("failed");
        return;
      }

      await loadLessonUnits(chapterSource.id);
      setGenerationState("succeeded");
    } catch {
      setGenerationState("failed");
      setGenerationError("Generation failed because the local API is unreachable.");
    }
  }

  async function patchLessonUnit(
    unitId: string,
    patch: UpdateLessonUnitRequest,
  ): Promise<LessonUnitResponse | null> {
    try {
      const response = await fetch(`/api/lesson-units/${unitId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });
      const body = await response.json();

      if (!response.ok) {
        setReviewError(
          parseResponseMessage(body, "Unable to save lesson unit changes."),
        );
        return null;
      }

      return body as LessonUnitResponse;
    } catch {
      setReviewError("Unable to save lesson unit changes.");
      return null;
    }
  }

  async function saveLessonUnit(unitId: string): Promise<void> {
    const draft = editDrafts[unitId];
    const current = lessonUnits.find((unit) => unit.id === unitId);

    if (!draft || !current) {
      return;
    }

    const payload = buildUnitPayload(draft);
    const updated = await patchLessonUnit(unitId, payload);

    if (!updated) {
      return;
    }

    const nextUnits = lessonUnits.map((unit) =>
      unit.id === unitId ? updated : unit,
    );

    setLessonUnits(nextUnits);
    setEditDrafts((currentDrafts) => ({
      ...currentDrafts,
      [unitId]: toLessonUnitDraft(updated),
    }));
    setReviewError(null);

    if (chapterSource) {
      await loadApprovedStudyUnits(chapterSource.id);
    }
  }

  async function setReviewStatus(
    unitId: string,
    reviewStatus: ReviewStatus,
  ): Promise<void> {
    const draft = editDrafts[unitId];
    if (!draft) {
      return;
    }

    const payload = {
      ...buildUnitPayload(draft),
      reviewStatus,
    };

    const updated = await patchLessonUnit(unitId, payload);
    if (!updated) {
      return;
    }

    setLessonUnits((units) =>
      units.map((unit) => (unit.id === unitId ? updated : unit)),
    );
    setEditDrafts((drafts) => ({
      ...drafts,
      [unitId]: {
        ...drafts[unitId],
        reviewStatus,
      },
    }));
    setReviewError(null);

    if (chapterSource) {
      await loadApprovedStudyUnits(chapterSource.id);
    }
  }

  async function regenerateUnit(unitId: string): Promise<void> {
    if (!chapterSource) {
      return;
    }

    const draft = editDrafts[unitId];

    try {
      const request: RegenerateLessonUnitRequest = {
        provider: "mock",
        ...(draft?.reviewerNotes ? { reviewerNotes: draft.reviewerNotes } : {}),
      };
      const response = await fetch(`/api/lesson-units/${unitId}/regenerate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      const body = await response.json();

      if (!response.ok) {
        setReviewError(
          parseResponseMessage(
            body,
            "Unable to regenerate lesson unit.",
          ),
        );
        return;
      }

      const updated = body as { lessonUnit: LessonUnitResponse };
      setLessonUnits((units) =>
        units.map((unit) =>
          unit.id === unitId ? updated.lessonUnit : unit,
        ),
      );
      setEditDrafts((drafts) => ({
        ...drafts,
        [unitId]: toLessonUnitDraft(updated.lessonUnit),
      }));
      setReviewError(null);
      await loadLessonUnits(chapterSource.id);
    } catch {
      setReviewError("Unable to regenerate lesson unit.");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local study workspace</p>
          <h1>Mneme</h1>
        </div>
        <span className={`status-pill status-pill--${healthState}`}>
          API {healthState}
        </span>
      </header>

      <section className="source-panel" aria-labelledby="source-heading">
        <div>
          <p className="eyebrow">Proof of concept source</p>
          <h2 id="source-heading">Deep Learning, Chapter 17</h2>
          <p>
            Monte Carlo Methods by Ian Goodfellow, Yoshua Bengio, and Aaron
            Courville.
          </p>
        </div>
        <a
          href="https://www.deeplearningbook.org/contents/monte_carlo.html"
          rel="noreferrer"
          target="_blank"
        >
          Source
        </a>
      </section>

      <section className="workspace" aria-labelledby="workspace-heading">
        <div className="workspace__header">
          <div>
            <p className="eyebrow">Current chapter</p>
            <h2 id="workspace-heading">
              {chapterSource
                ? formatChapterHeading(chapterSource)
                : "No excerpt imported"}
            </h2>
          </div>
          {chapterSource ? null : <a href="#import-heading">Import now</a>}
        </div>

        <ol className="workflow-list" aria-label="Study workflow state">
          {workflowItems.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.status}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="import-panel" aria-labelledby="import-heading">
        <div className="section-heading">
          <p className="eyebrow">Import Markdown</p>
          <h2 id="import-heading">Chapter excerpt</h2>
        </div>

        <form className="import-form" onSubmit={handleSubmit}>
          <label>
            <span>Book title</span>
            <input
              required
              value={formState.bookTitle}
              onChange={(event) => updateField("bookTitle", event.target.value)}
            />
          </label>

          <label>
            <span>Authors</span>
            <input
              required
              value={formState.authorsText}
              onChange={(event) =>
                updateField("authorsText", event.target.value)
              }
            />
          </label>

          <div className="form-row">
            <label>
              <span>Publisher</span>
              <input
                value={formState.publisher}
                onChange={(event) =>
                  updateField("publisher", event.target.value)
                }
              />
            </label>

            <label>
              <span>Year</span>
              <input
                inputMode="numeric"
                value={formState.year}
                onChange={(event) => updateField("year", event.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>Chapter title</span>
              <input
                required
                value={formState.chapterTitle}
                onChange={(event) =>
                  updateField("chapterTitle", event.target.value)
                }
              />
            </label>

            <label>
              <span>Chapter number</span>
              <input
                value={formState.chapterNumber}
                onChange={(event) =>
                  updateField("chapterNumber", event.target.value)
                }
              />
            </label>
          </div>

          <label>
            <span>Source URL</span>
            <input
              required
              type="url"
              value={formState.sourceUrl}
              onChange={(event) => updateField("sourceUrl", event.target.value)}
            />
          </label>

          <label>
            <span>Citation</span>
            <textarea
              required
              rows={3}
              value={formState.citationText}
              onChange={(event) =>
                updateField("citationText", event.target.value)
              }
            />
          </label>

          <label>
            <span>Study emphasis</span>
            <textarea
              rows={3}
              value={formState.emphasisNotes}
              onChange={(event) =>
                updateField("emphasisNotes", event.target.value)
              }
            />
          </label>

          <label>
            <span>Markdown file</span>
            <input
              accept=".md,.markdown,text/markdown,text/plain"
              type="file"
              onChange={handleFileChange}
            />
          </label>

          <label>
            <span>Markdown excerpt</span>
            <textarea
              required
              rows={12}
              value={formState.markdown}
              onChange={(event) => updateField("markdown", event.target.value)}
              placeholder="Paste a short Chapter 17 excerpt here. Do not commit full copyrighted chapter text to the repository."
            />
          </label>

          <div className="form-actions">
            <button type="submit" disabled={importState === "submitting"}>
              {importState === "submitting" ? "Importing" : "Import excerpt"}
            </button>
            {importError ? <p role="alert">{importError}</p> : null}
          </div>
        </form>
      </section>

      {chapterSource ? (
        <section className="generation-section" aria-labelledby="generation-heading">
          <div className="section-heading">
            <p className="eyebrow">Generate lesson draft</p>
            <h2 id="generation-heading">Draft generation</h2>
          </div>

          <div className="form-actions">
            <button
              disabled={generationState === "submitting"}
              onClick={() => {
                void generateLessonDraft();
              }}
            >
              {generationState === "submitting"
                ? "Generating"
                : "Generate draft lesson units"}
            </button>
          </div>

          <p>{generationStatus}</p>
          {generationError ? <p role="alert">{generationError}</p> : null}
        </section>
      ) : null}

      {chapterSource ? (
        <section
          className="import-result"
          aria-labelledby="import-result-heading"
        >
          <div className="section-heading">
            <p className="eyebrow">Saved source</p>
            <h2 id="import-result-heading">Import result</h2>
          </div>

          <dl>
            <div>
              <dt>Source credit</dt>
              <dd>
                {formatSourceCredit(chapterSource)}, by
                {" "}
                {formatAuthors(chapterSource.authors)}. {" "}
                {chapterSource.publisher ? `${chapterSource.publisher}. ` : ""}
                {chapterSource.year ? `${chapterSource.year}. ` : ""}
                <a
                  href={chapterSource.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Chapter source
                </a>
              </dd>
            </div>
            <div>
              <dt>Content hash</dt>
              <dd>
                <code>{chapterSource.contentHash}</code>
              </dd>
            </div>
            <div>
              <dt>Source anchors</dt>
              <dd>{chapterSource.anchors.length} paragraph anchors stored</dd>
            </div>
            <div>
              <dt>Citation</dt>
              <dd>{chapterSource.citationText}</dd>
            </div>
            {chapterSource.emphasisNotes ? (
              <div>
                <dt>Study emphasis</dt>
                <dd>{chapterSource.emphasisNotes}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {lessonUnits.length > 0 ? (
        <section
          className="review-section"
          aria-labelledby="review-heading"
        >
          <div className="section-heading">
            <p className="eyebrow">Review generated units</p>
            <h2 id="review-heading">Review and approve</h2>
            <p>
              {approvedUnitCount} approved, {lessonUnits.length} total units
            </p>
          </div>

          {reviewError ? <p role="alert">{reviewError}</p> : null}

          {lessonUnits.map((unit) => {
            const draft = editDrafts[unit.id] ?? toLessonUnitDraft(unit);
            return (
              <article className="unit-card" key={unit.id}>
                <div className="unit-card__header">
                  <div>
                    <h3>{draft.title}</h3>
                    <p className="eyebrow">
                      Source credit: {formatSourceCreditForUnit(unit.sourceCredit)}
                    </p>
                  </div>
                  <strong className="unit-card__status">{unit.reviewStatus}</strong>
                </div>

                <p className="unit-card__anchors">
                  Source context: {formatSourceAnchors(unit)}
                </p>

                <div className="checkpoint-list" aria-label="Generated checkpoints">
                  {unit.checkpoints.map((checkpoint) => (
                    <section key={checkpoint.id}>
                      <h4>Checkpoint {checkpoint.orderIndex + 1}</h4>
                      <p>{checkpoint.promptMd}</p>
                      <details>
                        <summary>Expected answer and self-check rubric</summary>
                        <p>{checkpoint.expectedAnswerMd}</p>
                        <ul>
                          {checkpoint.rubric.map((rubricItem) => (
                            <li key={rubricItem.rating}>
                              <strong>{rubricItem.rating}:</strong>{" "}
                              {rubricItem.description}
                            </li>
                          ))}
                        </ul>
                      </details>
                    </section>
                  ))}
                </div>

                <label>
                  <span>Title</span>
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraftField(unit.id, "title", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>Learning objective</span>
                  <textarea
                    rows={3}
                    value={draft.learningObjective}
                    onChange={(event) =>
                      setDraftField(
                        unit.id,
                        "learningObjective",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Explanation</span>
                  <textarea
                    rows={4}
                    value={draft.explanationMd}
                    onChange={(event) =>
                      setDraftField(
                        unit.id,
                        "explanationMd",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Intuition</span>
                  <textarea
                    rows={4}
                    value={draft.intuitionMd}
                    onChange={(event) =>
                      setDraftField(
                        unit.id,
                        "intuitionMd",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Notation</span>
                  <textarea
                    rows={3}
                    value={draft.notationMd}
                    onChange={(event) =>
                      setDraftField(
                        unit.id,
                        "notationMd",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Example</span>
                  <textarea
                    rows={3}
                    value={draft.exampleMd}
                    onChange={(event) =>
                      setDraftField(
                        unit.id,
                        "exampleMd",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Misconception notes</span>
                  <textarea
                    rows={3}
                    value={draft.misconceptionMd}
                    onChange={(event) =>
                      setDraftField(
                        unit.id,
                        "misconceptionMd",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Reviewer notes</span>
                  <textarea
                    rows={2}
                    value={draft.reviewerNotes}
                    onChange={(event) =>
                      setDraftField(
                        unit.id,
                        "reviewerNotes",
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  <span>Review status</span>
                  <select
                    value={draft.reviewStatus}
                    onChange={(event) =>
                      setDraftField(
                        unit.id,
                        "reviewStatus",
                        event.target.value as ReviewStatus,
                      )
                    }
                  >
                    {reviewStatusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="form-actions">
                  <button
                    type="button"
                    onClick={() => {
                      void saveLessonUnit(unit.id);
                    }}
                  >
                    Save edits
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void setReviewStatus(unit.id, "approved");
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void setReviewStatus(unit.id, "rejected");
                    }}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void setReviewStatus(unit.id, "needs_regeneration");
                    }}
                  >
                    Mark for regeneration
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void regenerateUnit(unit.id);
                    }}
                  >
                    Regenerate unit
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {chapterSource && approvedStudyUnits.length > 0 ? (
        <section
          className="review-section"
          aria-labelledby="study-heading"
        >
          <div className="section-heading">
            <p className="eyebrow">Ready for study</p>
            <h2 id="study-heading">Approved units are study-ready</h2>
          </div>

          <p>
            {approvedStudyUnits.length} unit(s) available from
            {" "}
            {formatSourceCreditForUnit(approvedStudyUnits[0].sourceCredit)}.
          </p>

          <ol className="study-units-preview" aria-label="Approved study units">
            {approvedStudyUnits.map((unit) => (
              <li key={unit.id}>
                <strong>{unit.title}</strong>
                {unit.checkpoints[0] ? (
                  <span>{unit.checkpoints[0].promptMd}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
