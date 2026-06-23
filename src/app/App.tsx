import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import type {
  ChapterSourceResponse,
  CreateChapterSourceRequest,
  SourceCredit,
  SourceAnchor,
  ValidationIssue,
} from "../shared/source";
import type {
  CreateGenerationRunRequest,
  GenerationRunResponse,
  LessonGenerationRubricItem,
  LessonUnitResponse,
  RegenerateLessonUnitRequest,
  ReviewStatus,
  UpdateLessonUnitRequest,
} from "../shared/generation";
import type {
  Confidence,
  SelfRating,
  WeakConcept,
  WeakConceptsResponse,
  StudyAttemptResponse,
} from "../shared/study";

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
  checkpoints: CheckpointDraft[];
};

type CheckpointDraft = {
  id: string;
  promptMd: string;
  expectedAnswerMd: string;
  rubric: LessonGenerationRubricItem[];
};

type StudyAttemptSubmissionState = "idle" | "submitting" | "success" | "error";

type StudyAttemptStepKey = string;

type LocalAttemptSignal = {
  lessonUnitId: string;
  conceptKeys: string[];
  sourceAnchors: SourceAnchor[];
  attemptedAt: string;
  selfRating: SelfRating;
  confidence: Confidence;
};

type StudyAttemptStepState = {
  selectedOptionIndex: number | null;
  answerText: string;
  revealRubric: boolean;
  selfRating: SelfRating | "";
  confidence: Confidence | "";
  submissionState: StudyAttemptSubmissionState;
  message: string | null;
  lastAttempt?: LocalAttemptSignal;
};

type StudyQueueItem = {
  unit: LessonUnitResponse;
  checkpoint: LessonUnitResponse["checkpoints"][number];
  unitIndex: number;
  checkpointIndex: number;
};

const FALLBACK_RUBRIC: LessonGenerationRubricItem[] = [
  {
    rating: "wrong",
    description: "The selected response is incorrect.",
  },
  {
    rating: "partial",
    description: "The selected response is partially correct.",
  },
  {
    rating: "correct",
    description: "The selected response is correct.",
  },
];

const confidenceOptions: Confidence[] = ["low", "medium", "high"];
const FALLBACK_MCQ_OPTIONS: string[] = [
  "No clear answer was provided.",
  "I need to review this concept first.",
  "I do not know the correct response.",
];

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
    checkpoints: unit.checkpoints.map((checkpoint) => ({
      id: checkpoint.id,
      promptMd: checkpoint.promptMd,
      expectedAnswerMd: checkpoint.expectedAnswerMd,
      rubric: checkpoint.rubric.map((rubricItem) => ({
        ...rubricItem,
      })),
    })),
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

function formatSourceContext(unit: LessonUnitResponse): string[] {
  return unit.sourceContext?.map((snippet) => {
    const heading = snippet.headingPath.length > 0
      ? snippet.headingPath.join(" » ")
      : "Untitled section";

    return `[${snippet.paragraphIndex}] ${heading}: ${snippet.text.trim()}`;
  }) ?? [];
}

function formatAnchorList(anchors: SourceAnchor[]): string {
  return anchors.length === 0
    ? "No source anchors recorded."
    : anchors
        .map((anchor) => {
          const heading = anchor.headingPath.length > 0
            ? anchor.headingPath.join(" » ")
            : "Untitled section";

          return `${heading} (paragraph ${anchor.paragraphStart}-${anchor.paragraphEnd})`;
        })
        .join("; ");
}

function buildStudyStepStateKey(
  unitId: string,
  checkpointId: string,
): StudyAttemptStepKey {
  return `${unitId}:${checkpointId}`;
}

function getStepRubric(
  checkpoint: LessonUnitResponse["checkpoints"][number],
): LessonGenerationRubricItem[] {
  return checkpoint.rubric.length > 0 ? checkpoint.rubric : FALLBACK_RUBRIC;
}

function buildStudyQueue(units: LessonUnitResponse[]): StudyQueueItem[] {
  return units.flatMap((unit, unitIndex) =>
    unit.checkpoints.map((checkpoint, checkpointIndex) => ({
      unit,
      checkpoint,
      unitIndex,
      checkpointIndex,
    })),
  );
}

function buildCheckpointOptions(
  checkpoint: LessonUnitResponse["checkpoints"][number],
): string[] {
  const candidateOptions = [
    checkpoint.expectedAnswerMd,
    ...checkpoint.rubric.map((rubricItem) => rubricItem.description),
    ...FALLBACK_MCQ_OPTIONS,
  ]
    .map((option) => option.trim())
    .filter((option) => option.length > 0);

  const uniqueOptions = Array.from(new Set(candidateOptions));

  if (uniqueOptions.length >= 3) {
    return uniqueOptions.slice(0, 3);
  }

  const fallback = [...uniqueOptions];

  for (const option of FALLBACK_MCQ_OPTIONS) {
    if (fallback.length >= 3) {
      break;
    }

    if (!fallback.includes(option)) {
      fallback.push(option);
    }
  }

  return fallback.slice(0, 3);
}

function formatWeakConceptsSummary(concepts: WeakConcept[]): string {
  if (concepts.length === 0) {
    return "No weak concepts yet.";
  }

  return concepts
    .map(
      (concept) =>
        `${concept.conceptKey}: ${concept.attempts} attempt(s), units ${
          concept.lessonUnitIds.length
        }`,
    )
    .join(" • ");
}

function buildAttemptAnswer(
  step: StudyAttemptStepState,
  options: string[],
): string | null {
  const typedAnswer = step.answerText.trim();

  if (typedAnswer.length > 0) {
    return typedAnswer;
  }

  if (step.selectedOptionIndex === null) {
    return null;
  }

  return options[step.selectedOptionIndex] ?? null;
}

function buildLocalAttemptSummary(signal?: LocalAttemptSignal): string {
  if (!signal) {
    return "No attempt recorded in this step yet.";
  }

  if (signal.selfRating === "correct") {
    return "No weak-concept signal this attempt (rated correct).";
  }

  const conceptSummary = signal.conceptKeys.length > 0
    ? `${signal.conceptKeys.length} concept(s)`
    : "No concept keys were captured";

  return `${signal.selfRating.toUpperCase()} (${signal.confidence}), unit ${signal.lessonUnitId}: ${conceptSummary}.`;
}

function createDefaultStudyAttemptStepState(): StudyAttemptStepState {
  return {
    selectedOptionIndex: null,
    answerText: "",
    revealRubric: false,
    selfRating: "",
    confidence: "",
    submissionState: "idle",
    message: null,
  };
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
  };
}

function buildCheckpointEdits(
  current: LessonUnitResponse,
  draft: LessonUnitDraft,
): Pick<
  UpdateLessonUnitRequest,
  "checkpointPatches" | "checkpointReplacements"
> {
  const hasCheckpointMismatch =
    current.checkpoints.length !== draft.checkpoints.length ||
    draft.checkpoints.some((checkpointDraft, index) => {
      const currentCheckpoint = current.checkpoints[index];
      return !currentCheckpoint || currentCheckpoint.id !== checkpointDraft.id;
    });

  if (hasCheckpointMismatch) {
    return {
      checkpointReplacements: draft.checkpoints.map((checkpoint) => ({
        promptMd: checkpoint.promptMd,
        expectedAnswerMd: checkpoint.expectedAnswerMd,
        rubric: checkpoint.rubric,
      })),
    };
  }

  const patches: NonNullable<UpdateLessonUnitRequest["checkpointPatches"]> = [];

  for (const [index, checkpointDraft] of draft.checkpoints.entries()) {
    const currentCheckpoint = current.checkpoints[index]!;

    const checkpointPatch: NonNullable<
      UpdateLessonUnitRequest["checkpointPatches"]
    >[number] = {
      checkpointId: checkpointDraft.id,
    };
    let hasPatch = false;

    if (checkpointDraft.promptMd !== currentCheckpoint.promptMd) {
      checkpointPatch.promptMd = checkpointDraft.promptMd;
      hasPatch = true;
    }

    if (checkpointDraft.expectedAnswerMd !== currentCheckpoint.expectedAnswerMd) {
      checkpointPatch.expectedAnswerMd = checkpointDraft.expectedAnswerMd;
      hasPatch = true;
    }

    if (
      JSON.stringify(checkpointDraft.rubric) !==
      JSON.stringify(currentCheckpoint.rubric)
    ) {
      checkpointPatch.rubric = checkpointDraft.rubric;
      hasPatch = true;
    }

    if (hasPatch) {
      patches.push(checkpointPatch);
    }
  }

  return patches.length > 0 ? { checkpointPatches: patches } : {};
}

function buildLessonUnitPayload(
  unit: LessonUnitResponse,
  draft: LessonUnitDraft,
): UpdateLessonUnitRequest {
  const checkpointEdits = buildCheckpointEdits(unit, draft);

  return {
    ...buildUnitPayload(draft),
    ...checkpointEdits,
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
  const [weakConcepts, setWeakConcepts] = useState<WeakConcept[]>([]);
  const [weakConceptsError, setWeakConceptsError] = useState<string | null>(
    null,
  );
  const [weakConceptsLoading, setWeakConceptsLoading] = useState<boolean>(false);
  const [chapterSource, setChapterSource] =
    useState<ChapterSourceResponse | null>(null);
  const [lessonUnits, setLessonUnits] = useState<LessonUnitResponse[]>([]);
  const [editDrafts, setEditDrafts] = useState<Record<string, LessonUnitDraft>>(
    {},
  );
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [studyStepIndex, setStudyStepIndex] = useState<number>(0);
  const [studyAttemptStates, setStudyAttemptStates] = useState<
    Record<StudyAttemptStepKey, StudyAttemptStepState>
  >({});

  const workflowItems = useMemo(
    () => buildWorkflowItems(chapterSource, lessonUnits),
    [chapterSource, lessonUnits],
  );
  const studyQueue = useMemo(
    () => buildStudyQueue(approvedStudyUnits),
    [approvedStudyUnits],
  );
  const activeStudyStepIndex = studyQueue.length > 0
    ? Math.min(studyStepIndex, studyQueue.length - 1)
    : 0;
  const activeStep = studyQueue[activeStudyStepIndex];
  const activeStepKey = activeStep
    ? buildStudyStepStateKey(activeStep.unit.id, activeStep.checkpoint.id)
    : null;

  useEffect(() => {
    if (studyQueue.length === 0) {
      setStudyStepIndex(0);
      return;
    }

    setStudyStepIndex((current) => Math.min(current, studyQueue.length - 1));
  }, [studyQueue]);

  const approvedUnitCount = approvedStudyUnits.length;
  const activeStepState = activeStepKey
    ? buildStepDefaults(activeStepKey)
    : null;
  const activeStepOptions = activeStep
    ? buildCheckpointOptions(activeStep.checkpoint)
    : [];
  const activeStepRubric = activeStep
    ? getStepRubric(activeStep.checkpoint)
    : FALLBACK_RUBRIC;
  const studyProgressLabel = studyQueue.length > 0
    ? `Checkpoint ${activeStudyStepIndex + 1} of ${studyQueue.length}`
    : "No study checkpoints available";

  function updateStudyAttemptState(
    stepKey: StudyAttemptStepKey,
    updater: (state: StudyAttemptStepState) => StudyAttemptStepState,
  ): void {
    setStudyAttemptStates((current) => {
      const previous = current[stepKey];
      const next = updater(previous ?? createDefaultStudyAttemptStepState());

      return {
        ...current,
        [stepKey]: next,
      };
    });
  }

  function buildStepDefaults(stepKey: StudyAttemptStepKey): StudyAttemptStepState {
    return studyAttemptStates[stepKey] ?? createDefaultStudyAttemptStepState();
  }

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

  function setCheckpointDraftField(
    unitId: string,
    checkpointId: string,
    field: keyof Omit<CheckpointDraft, "id">,
    value: string,
  ): void {
    setEditDrafts((current) => {
      const draft = current[unitId];

      if (!draft) {
        return current;
      }

      const nextCheckpoints = draft.checkpoints.map((checkpoint) =>
        checkpoint.id === checkpointId
          ? { ...checkpoint, [field]: value }
          : checkpoint,
      );

      return {
        ...current,
        [unitId]: {
          ...draft,
          checkpoints: nextCheckpoints,
        },
      };
    });
  }

  function setCheckpointRubricField(
    unitId: string,
    checkpointId: string,
    itemIndex: number,
    field: keyof LessonGenerationRubricItem,
    value: string,
  ): void {
    setEditDrafts((current) => {
      const draft = current[unitId];

      if (!draft) {
        return current;
      }

      const nextCheckpoints = draft.checkpoints.map((checkpoint) => {
        if (checkpoint.id !== checkpointId) {
          return checkpoint;
        }

        const nextRubric = checkpoint.rubric.map((rubricItem, rubricIndex) =>
          rubricIndex === itemIndex
            ? {
                ...rubricItem,
                [field]: value,
              }
            : rubricItem,
        );

        return {
          ...checkpoint,
          rubric: nextRubric,
        };
      });

      return {
        ...current,
        [unitId]: {
          ...draft,
          checkpoints: nextCheckpoints,
        },
      };
    });
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

  async function loadWeakConcepts(sourceId: string): Promise<void> {
    setWeakConceptsLoading(true);
    setWeakConceptsError(null);

    try {
      const response = await fetch(`/api/weak-concepts?chapterSourceId=${sourceId}`);
      const body: unknown = await response.json();

      if (!response.ok) {
        setWeakConceptsError(
          parseResponseMessage(
            body,
            "Unable to load weak concept signals.",
          ),
        );
        setWeakConcepts([]);
        return;
      }

      const payload = body as WeakConceptsResponse;
      setWeakConcepts(payload.concepts ?? []);
    } finally {
      setWeakConceptsLoading(false);
    }
  }

  async function loadApprovedStudyUnits(sourceId: string): Promise<void> {
    const response = await fetch(`/api/study-paths/${sourceId}`);
    const body = await response.json();

    if (!response.ok) {
      setApprovedStudyUnits([]);
      setWeakConcepts([]);
      return;
    }

    setApprovedStudyUnits((body.units as LessonUnitResponse[]) ?? []);
    void loadWeakConcepts(sourceId);
  }

  function nextStudyStep(): void {
    if (activeStudyStepIndex < studyQueue.length - 1) {
      setStudyStepIndex((current) =>
        Math.min(current + 1, studyQueue.length - 1),
      );
    }
  }

  function previousStudyStep(): void {
    if (activeStudyStepIndex > 0) {
      setStudyStepIndex((current) => Math.max(current - 1, 0));
    }
  }

  function shouldDisableSubmit(step: StudyAttemptStepState): boolean {
    const answer = buildAttemptAnswer(step, activeStepOptions);
    const hasAnswer = answer !== null && answer.trim().length > 0;

    return (
      step.submissionState === "submitting" ||
      !hasAnswer ||
      step.selfRating === "" ||
      step.confidence === ""
    );
  }

  async function submitStudyAttempt(): Promise<void> {
    if (!activeStep || !activeStepKey || !chapterSource) {
      return;
    }

    const step = buildStepDefaults(activeStepKey);
    const options = buildCheckpointOptions(activeStep.checkpoint);
    const answerMd = buildAttemptAnswer(step, options);

    if (!answerMd) {
      setStudyAttemptStateError(
        activeStepKey,
        "Choose an option or type a text answer.",
      );
      return;
    }

    if (step.selfRating === "" || step.confidence === "") {
      setStudyAttemptStateError(
        activeStepKey,
        "Choose a self-rating and confidence value.",
      );
      return;
    }

    updateStudyAttemptState(activeStepKey, (state) => ({
      ...state,
      submissionState: "submitting",
      message: null,
    }));

    try {
      const response = await fetch("/api/study-attempts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          checkpointId: activeStep.checkpoint.id,
          answerMd,
          selfRating: step.selfRating,
          confidence: step.confidence,
        }),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        updateStudyAttemptState(activeStepKey, (state) => ({
          ...state,
          submissionState: "error",
          message: parseResponseMessage(
            body,
            "Unable to record checkpoint attempt.",
          ),
        }));
        return;
      }

      await loadWeakConcepts(chapterSource.id);
      const attempt = body as StudyAttemptResponse;
      updateStudyAttemptState(activeStepKey, (state) => ({
        ...state,
        submissionState: "success",
        message:
          "Checkpoint attempt recorded. Review the feedback, then continue when ready.",
        lastAttempt: {
          lessonUnitId: activeStep.unit.id,
          conceptKeys: attempt.conceptKeys,
          sourceAnchors: attempt.sourceAnchors,
          attemptedAt: attempt.attemptedAt,
          selfRating: attempt.selfRating,
          confidence: attempt.confidence,
        },
      }));
    } catch {
      updateStudyAttemptState(activeStepKey, (state) => ({
        ...state,
        submissionState: "error",
        message: "Unable to record checkpoint attempt right now.",
      }));
    }
  }

  function setStudyAttemptStateError(
    stepKey: StudyAttemptStepKey,
    message: string,
  ): void {
    updateStudyAttemptState(stepKey, (state) => ({
      ...state,
      submissionState: "error",
      message,
    }));
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

    const payload = buildLessonUnitPayload(current, draft);
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

    const current = lessonUnits.find((unit) => unit.id === unitId);
    if (!current) {
      return;
    }

    const payload = {
      ...buildLessonUnitPayload(current, draft),
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

        <form className="import-form" data-testid="import-form" onSubmit={handleSubmit}>
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
              data-testid="markdown-input"
              required
              rows={12}
              value={formState.markdown}
              onChange={(event) => updateField("markdown", event.target.value)}
              placeholder="Paste a short Chapter 17 excerpt here. Do not commit full copyrighted chapter text to the repository."
            />
          </label>

          <div className="form-actions">
            <button
              data-testid="import-submit"
              type="submit"
              disabled={importState === "submitting"}
            >
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
              data-testid="generate-draft"
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
            const sourceContext = formatSourceContext(unit);

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
                  Source anchors: {formatSourceAnchors(unit)}
                </p>
                {sourceContext.length > 0 ? (
                  <details className="unit-card__source-context">
                    <summary>Source excerpts from imported markdown</summary>
                    <ol>
                      {sourceContext.map((snippet, index) => (
                        <li key={`${unit.id}-${index}`}>{snippet}</li>
                      ))}
                    </ol>
                  </details>
                ) : null}

                <div className="checkpoint-list" aria-label="Generated checkpoints">
                  {unit.checkpoints.map((checkpoint, index) => {
                    const checkpointDraft = draft.checkpoints[index] ?? {
                      id: checkpoint.id,
                      promptMd: checkpoint.promptMd,
                      expectedAnswerMd: checkpoint.expectedAnswerMd,
                      rubric: checkpoint.rubric.map((rubricItem) => ({
                        ...rubricItem,
                      })),
                    };

                    return (
                      <section key={checkpoint.id}>
                        <h4>Checkpoint {checkpoint.orderIndex + 1}</h4>
                        <label>
                          <span>Checkpoint prompt</span>
                          <textarea
                            rows={3}
                            value={checkpointDraft.promptMd}
                            onChange={(event) =>
                              setCheckpointDraftField(
                                unit.id,
                                checkpoint.id,
                                "promptMd",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          <span>Expected answer</span>
                          <textarea
                            rows={3}
                            value={checkpointDraft.expectedAnswerMd}
                            onChange={(event) =>
                              setCheckpointDraftField(
                                unit.id,
                                checkpoint.id,
                                "expectedAnswerMd",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <div className="checkpoint-rubric">
                          <h5>Rubric</h5>
                          {checkpointDraft.rubric.map((rubricItem, rubricIndex) => (
                            <div
                              className="checkpoint-rubric__item"
                              key={`${checkpoint.id}-${rubricItem.rating}-${rubricIndex}`}
                            >
                              <label>
                                <span>Rating</span>
                                <select
                                  value={rubricItem.rating}
                                  onChange={(event) =>
                                    setCheckpointRubricField(
                                      unit.id,
                                      checkpoint.id,
                                      rubricIndex,
                                      "rating",
                                      event.target.value as LessonGenerationRubricItem["rating"],
                                    )
                                  }
                                >
                                  <option value="wrong">wrong</option>
                                  <option value="partial">partial</option>
                                  <option value="correct">correct</option>
                                </select>
                              </label>
                              <label>
                                <span>Description</span>
                                <textarea
                                  rows={2}
                                  value={rubricItem.description}
                                  onChange={(event) =>
                                    setCheckpointRubricField(
                                      unit.id,
                                      checkpoint.id,
                                      rubricIndex,
                                      "description",
                                      event.target.value,
                                    )
                                  }
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
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
                    data-testid="approve-unit"
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

      {chapterSource ? (
        <section
          className="review-section"
          aria-labelledby="study-heading"
        >
          <div className="section-heading">
            <p className="eyebrow">Ready for study</p>
            <h2 id="study-heading">Guided checkpoint study</h2>
          </div>

          <p>
            {approvedStudyUnits.length} approved unit(s) available from
            {approvedStudyUnits.length > 0
              ? ` ${formatSourceCreditForUnit(approvedStudyUnits[0].sourceCredit)}.`
              : "."}
            {approvedStudyUnits.length > 0 ? ` ${studyProgressLabel}.` : ""}
          </p>

          <div className="weak-concepts-panel">
            <h3>Weak concepts from prior attempts</h3>
            {weakConceptsLoading ? (
              <p>Loading weak concept signals...</p>
            ) : (
              <p data-testid="weak-concepts">
                {formatWeakConceptsSummary(weakConcepts)}
              </p>
            )}
            {weakConceptsError ? <p role="alert">{weakConceptsError}</p> : null}
          </div>

          {studyQueue.length === 0 ? (
            <p>
              No approved checkpoint is available yet. Approve a lesson unit to
              begin study.
            </p>
          ) : (
            <article className="study-step" data-testid="study-step">
              <h3>{activeStep.unit.title}</h3>
              <p className="eyebrow">
                Unit {activeStep.unitIndex + 1}, checkpoint
                {` ${activeStep.checkpointIndex + 1}`}
              </p>
              <p>
                <strong>Source:</strong>{" "}
                {formatSourceCreditForUnit(activeStep.unit.sourceCredit)}
              </p>
              <p>
                <strong>Concept keys:</strong>{" "}
                {activeStep.unit.conceptKeys.join(", ")}
              </p>
              <p>
                <strong>Source anchors:</strong>{" "}
                {formatAnchorList(activeStep.unit.sourceAnchors)}
              </p>
              {activeStep.unit.sourceContext &&
              activeStep.unit.sourceContext.length > 0 ? (
                <details className="unit-card__source-context">
                  <summary>Source excerpts</summary>
                  <ol>
                    {activeStep.unit.sourceContext.map((snippet) => (
                      <li key={`${activeStep.unit.id}-${snippet.paragraphIndex}`}>
                        [{snippet.paragraphIndex}] {snippet.text}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}

              <div className="study-step__section">
                <p>
                  <strong>Learning objective:</strong>{" "}
                  {activeStep.unit.learningObjective}
                </p>
                <p>
                  <strong>Explanation:</strong>{" "}
                  {activeStep.unit.explanationMd}
                </p>
                <p>
                  <strong>Intuition:</strong> {activeStep.unit.intuitionMd}
                </p>
              </div>

              <div className="study-step__section">
                <h4>Checkpoint prompt</h4>
                <p data-testid="study-prompt">{activeStep.checkpoint.promptMd}</p>
              </div>

              <fieldset className="study-step__options">
                <legend>Choose one response</legend>
                {activeStepOptions.map((option, optionIndex) => (
                  <label key={`${activeStep.checkpoint.id}-option-${optionIndex}`}>
                    <input
                      data-testid={`study-option-${optionIndex}`}
                      type="radio"
                      name={`checkpoint-${activeStep.checkpoint.id}`}
                      checked={
                        activeStepState?.selectedOptionIndex === optionIndex
                      }
                      disabled={activeStepState?.submissionState === "submitting"}
                      onChange={() => {
                        updateStudyAttemptState(activeStepKey!, (state) => ({
                          ...state,
                          selectedOptionIndex: optionIndex,
                        }));
                      }}
                    />
                    <span>{option}</span>
                  </label>
                ))}
                {activeStepOptions.length === 0 ? (
                  <p>No generated MCQ options were available for this checkpoint.</p>
                ) : null}
              </fieldset>

              <label className="study-step__answer-text">
                <span>Or type your own response</span>
                <textarea
                  rows={3}
                  disabled={activeStepState?.submissionState === "submitting"}
                  value={activeStepState?.answerText ?? ""}
                  placeholder="Write a concise answer before submitting."
                  onChange={(event) => {
                    updateStudyAttemptState(activeStepKey!, (state) => ({
                      ...state,
                      answerText: event.target.value,
                    }));
                  }}
                />
              </label>

              <div className="study-step__section study-step__reveal">
                <button
                  data-testid="reveal-answer"
                  type="button"
                  onClick={() => {
                    updateStudyAttemptState(activeStepKey!, (state) => ({
                      ...state,
                      revealRubric: !state.revealRubric,
                    }));
                  }}
                >
                  {activeStepState?.revealRubric
                    ? "Hide expected answer"
                    : "Reveal expected answer and rubric"}
                </button>
                {activeStepState?.revealRubric ? (
                  <details className="unit-card__source-context">
                    <summary>Expected answer and rubric</summary>
                    <p>{activeStep.checkpoint.expectedAnswerMd}</p>
                    <ul>
                      {activeStepRubric.map((rubricItem, index) => (
                        <li key={`${rubricItem.rating}-${index}`}>
                          <strong>{rubricItem.rating}</strong>:{" "}
                          {rubricItem.description}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>

              <div className="form-row">
                <label>
                  <span>Self-rating</span>
                  <select
                    data-testid="self-rating"
                    value={activeStepState?.selfRating ?? ""}
                    onChange={(event) => {
                      updateStudyAttemptState(activeStepKey!, (state) => ({
                        ...state,
                        selfRating: event.target.value as SelfRating,
                      }));
                    }}
                  >
                    <option value="">Pick a rating</option>
                    <option value="wrong">wrong</option>
                    <option value="partial">partial</option>
                    <option value="correct">correct</option>
                  </select>
                </label>
                <label>
                  <span>Confidence</span>
                  <select
                    data-testid="confidence"
                    value={activeStepState?.confidence ?? ""}
                    onChange={(event) => {
                      updateStudyAttemptState(activeStepKey!, (state) => ({
                        ...state,
                        confidence: event.target.value as Confidence,
                      }));
                    }}
                  >
                    <option value="">Pick confidence</option>
                    {confidenceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {activeStepState?.message ? (
                <p role="alert">{activeStepState.message}</p>
              ) : null}

              <p className="study-step__local-signals" data-testid="local-attempt-signal">
                <strong>Latest local weak-signal:</strong>{" "}
                {buildLocalAttemptSummary(activeStepState?.lastAttempt)}
              </p>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => {
                    previousStudyStep();
                  }}
                  disabled={activeStudyStepIndex === 0}
                >
                  Previous
                </button>
                <button
                  data-testid="submit-attempt"
                  type="button"
                  onClick={() => {
                    void submitStudyAttempt();
                  }}
                  disabled={shouldDisableSubmit(
                    activeStepState ?? createDefaultStudyAttemptStepState(),
                  )}
                >
                  {activeStepState?.submissionState === "submitting"
                    ? "Submitting"
                    : "Submit attempt"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    nextStudyStep();
                  }}
                  disabled={activeStudyStepIndex >= studyQueue.length - 1}
                >
                  Next
                </button>
              </div>
            </article>
          )}
        </section>
      ) : null}
    </main>
  );
}
