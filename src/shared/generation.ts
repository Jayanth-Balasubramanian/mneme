import type { SourceAnchor, SourceCredit } from "./source";

export type ValidationIssue = {
  field: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export type LessonGenerationRubricRating = "wrong" | "partial" | "correct";

export type LessonGenerationRubricItem = {
  rating: LessonGenerationRubricRating;
  description: string;
};

export type LessonGenerationCheckpoint = {
  promptMd: string;
  expectedAnswerMd: string;
  rubric: LessonGenerationRubricItem[];
};

export type LessonGenerationUnit = {
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

export type LessonGenerationDraft = {
  title: string;
  summary: string;
  units: LessonGenerationUnit[];
};

export type ReviewStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "needs_regeneration";

export type CreateGenerationRunRequest = {
  chapterSourceId: string;
  provider: "mock" | "openai";
  learnerProfile: string;
};

export type GenerationRunResponse = {
  id: string;
  chapterSourceId: string;
  provider: "mock" | "openai" | string;
  model?: string;
  promptVersion: string;
  status: "succeeded" | "failed";
  lessonUnitIds: string[];
  errorMessage?: string;
  createdAt: string;
};

export type CheckpointResponse = {
  id: string;
  lessonUnitId: string;
  orderIndex: number;
  promptMd: string;
  expectedAnswerMd: string;
  rubric: LessonGenerationRubricItem[];
};

export type LessonUnitResponse = {
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
  reviewStatus: ReviewStatus;
  reviewerNotes?: string;
  checkpoints: CheckpointResponse[];
  sourceCredit: SourceCredit;
  createdAt: string;
  updatedAt: string;
};

export type LessonUnitListResponse = {
  units: LessonUnitResponse[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(
  input: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): string {
  const value = input[field];

  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ field, message: "Required non-empty string." });
    return "";
  }

  return value.trim();
}

function readOptionalString(
  input: Record<string, unknown>,
  field: string,
  issues?: ValidationIssue[],
): string | undefined {
  const value = input[field];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    issues?.push({
      field,
      message: "Expected a string.",
    });
    return undefined;
  }

  return value.trim() || undefined;
}

function readStringArray(
  input: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
  required = true,
): string[] {
  const value = input[field];

  if (!Array.isArray(value)) {
    if (required) {
      issues.push({
        field,
        message: "Expected an array of non-empty strings.",
      });
    }

    return [];
  }

  const entries = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0 && required) {
    issues.push({ field, message: "Expected at least one non-empty entry." });
  }

  return entries;
}

function readRubric(
  value: unknown,
  field: string,
  issues: ValidationIssue[],
): LessonGenerationRubricItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    issues.push({ field, message: "Expected at least one rubric item." });
    return [];
  }

  const rubric: LessonGenerationRubricItem[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const rawRubric = value[index];

    if (!isRecord(rawRubric)) {
      issues.push({
        field: `${field}[${index}]`,
        message: "Expected a rubric object.",
      });
      continue;
    }

    const rating = readRequiredString(rawRubric, "rating", issues);
    const description = readRequiredString(
      rawRubric,
      "description",
      issues,
    );

    if (!["wrong", "partial", "correct"].includes(rating)) {
      issues.push({
        field: `${field}[${index}].rating`,
        message: "Expected wrong, partial, or correct.",
      });
      continue;
    }

    if (description && rating) {
      rubric.push({
        rating,
        description,
      } as LessonGenerationRubricItem);
    }
  }

  return rubric;
}

function parseSourceAnchors(
  value: unknown,
  field: string,
): ValidationResult<SourceAnchor[]> {
  const issues: ValidationIssue[] = [];

  if (!Array.isArray(value)) {
    return {
      ok: false,
      issues: [{ field, message: "Expected an array of source anchors." }],
    };
  }

  const sourceAnchors: SourceAnchor[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const anchorIssues: ValidationIssue[] = [];
    const rawAnchor = value[index];

    if (!isRecord(rawAnchor)) {
      anchorIssues.push({
        field: `${field}[${index}]`,
        message: "Expected a source anchor object.",
      });
      issues.push(...anchorIssues);
      continue;
    }

    const headingPath = Array.isArray(rawAnchor.headingPath)
      ? rawAnchor.headingPath.filter(
          (part) => typeof part === "string" && part.trim().length > 0,
        )
      : [];

    if (!Array.isArray(rawAnchor.headingPath)) {
      anchorIssues.push({
        field: `${field}[${index}].headingPath`,
        message: "Expected headingPath array.",
      });
      issues.push(...anchorIssues);
      continue;
    }

    const paragraphStart = rawAnchor.paragraphStart;
    const paragraphEnd = rawAnchor.paragraphEnd;
    const safeParagraphStart =
      typeof paragraphStart === "number" ? paragraphStart : undefined;
    const safeParagraphEnd =
      typeof paragraphEnd === "number" ? paragraphEnd : undefined;
    const sourceUrl = readRequiredString(rawAnchor, "sourceUrl", issues);

    if (
      typeof paragraphStart !== "number" ||
      !Number.isInteger(paragraphStart) ||
      paragraphStart < 1
    ) {
      anchorIssues.push({
        field: `${field}[${index}].paragraphStart`,
        message: "Expected positive integer paragraphStart.",
      });
    }

    if (
      typeof paragraphEnd !== "number" ||
      !Number.isInteger(paragraphEnd) ||
      typeof safeParagraphStart !== "number" ||
      paragraphEnd < safeParagraphStart
    ) {
      anchorIssues.push({
        field: `${field}[${index}].paragraphEnd`,
        message: "Expected paragraphEnd >= paragraphStart.",
      });
    }

    if (anchorIssues.length > 0 || !sourceUrl) {
      issues.push(...anchorIssues);
      continue;
    }

    if (
      sourceUrl &&
      typeof safeParagraphStart === "number" &&
      typeof safeParagraphEnd === "number"
    ) {
      sourceAnchors.push({
        headingPath,
        paragraphStart: safeParagraphStart,
        paragraphEnd: safeParagraphEnd,
        sourceUrl,
      } as SourceAnchor);
    }
  }

  if (sourceAnchors.length === 0) {
    issues.push({ field, message: "Expected at least one source anchor." });
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: sourceAnchors };
}

function readOptionalSourceAnchors(
  input: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): SourceAnchor[] | undefined {
  const value = input[field];

  if (value === undefined || value === null) {
    issues.push({ field, message: "Expected source anchors." });
    return undefined;
  }

  const result = parseSourceAnchors(value, field);
  if (!result.ok) {
    issues.push(...result.issues);
    return undefined;
  }

  return result.value;
}

export function parseCreateGenerationRunRequest(
  payload: unknown,
): ValidationResult<CreateGenerationRunRequest> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(payload)) {
    return {
      ok: false,
      issues: [{ field: "body", message: "Expected a JSON object." }],
    };
  }

  const chapterSourceId = readRequiredString(payload, "chapterSourceId", issues);
  const provider = readRequiredString(payload, "provider", issues);
  const learnerProfile = readRequiredString(payload, "learnerProfile", issues);

  if (provider.length > 0 && provider !== "mock" && provider !== "openai") {
    issues.push({
      field: "provider",
      message: 'Expected "mock" or "openai".',
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      chapterSourceId,
      provider: provider as "mock" | "openai",
      learnerProfile,
    },
  };
}

export function parseLessonGenerationDraft(
  payload: unknown,
): ValidationResult<LessonGenerationDraft> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(payload)) {
    return {
      ok: false,
      issues: [{ field: "body", message: "Expected a JSON object." }],
    };
  }

  const title = readRequiredString(payload, "title", issues);
  const summary = readRequiredString(payload, "summary", issues);
  const unitsValue = payload.units;
  if (!Array.isArray(unitsValue)) {
    issues.push({ field: "units", message: "Expected an array." });
    return { ok: false, issues };
  }

  if (unitsValue.length === 0) {
    issues.push({
      field: "units",
      message: "Expected at least one lesson unit.",
    });
    return { ok: false, issues };
  }

  const units: LessonGenerationUnit[] = [];

  for (let unitIndex = 0; unitIndex < unitsValue.length; unitIndex += 1) {
    const rawUnit = unitsValue[unitIndex];

    if (!isRecord(rawUnit)) {
      issues.push({
        field: `units[${unitIndex}]`,
        message: "Expected a unit object.",
      });
      continue;
    }

    const unitTitle = readRequiredString(rawUnit, "title", issues);
    const learningObjective = readRequiredString(
      rawUnit,
      "learningObjective",
      issues,
    );
    const conceptKeys = readStringArray(rawUnit, "conceptKeys", issues, true);
    const sourceAnchors = readOptionalSourceAnchors(
      rawUnit,
      "sourceAnchors",
      issues,
    );
    const explanationMd = readRequiredString(rawUnit, "explanationMd", issues);
    const intuitionMd = readRequiredString(rawUnit, "intuitionMd", issues);
    const notationMd = readOptionalString(rawUnit, "notationMd");
    const exampleMd = readOptionalString(rawUnit, "exampleMd");
    const misconceptionMd = readOptionalString(rawUnit, "misconceptionMd");

    const checkpointsValue = rawUnit.checkpoints;
    if (!Array.isArray(checkpointsValue) || checkpointsValue.length === 0) {
      issues.push({
        field: `units[${unitIndex}].checkpoints`,
        message: "Expected at least one checkpoint.",
      });
      continue;
    }

    const checkpoints: LessonGenerationCheckpoint[] = [];
    for (
      let checkpointIndex = 0;
      checkpointIndex < checkpointsValue.length;
      checkpointIndex += 1
    ) {
      const rawCheckpoint = checkpointsValue[checkpointIndex];

      if (!isRecord(rawCheckpoint)) {
        issues.push({
          field: `units[${unitIndex}].checkpoints[${checkpointIndex}]`,
          message: "Expected a checkpoint object.",
        });
        continue;
      }

      const promptMd = readRequiredString(
        rawCheckpoint,
        "promptMd",
        issues,
      );
      const expectedAnswerMd = readRequiredString(
        rawCheckpoint,
        "expectedAnswerMd",
        issues,
      );
      const rubric = readRubric(
        rawCheckpoint.rubric,
        `units[${unitIndex}].checkpoints[${checkpointIndex}].rubric`,
        issues,
      );

      if (promptMd && expectedAnswerMd && rubric.length > 0) {
        checkpoints.push({
          promptMd,
          expectedAnswerMd,
          rubric,
        });
      }
    }

    if (!unitTitle || conceptKeys.length === 0 || !sourceAnchors) {
      continue;
    }

    if (checkpoints.length === 0) {
      continue;
    }

    units.push({
      title: unitTitle,
      learningObjective,
      conceptKeys: [...new Set(conceptKeys)],
      sourceAnchors,
      explanationMd,
      intuitionMd,
      notationMd,
      exampleMd,
      misconceptionMd,
      checkpoints,
    });
  }

  if (issues.length > 0 || units.length === 0) {
    if (units.length === 0) {
      issues.push({
        field: "units",
        message: "No valid lesson units found in provider output.",
      });
    }

    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      title,
      summary,
      units,
    },
  };
}
