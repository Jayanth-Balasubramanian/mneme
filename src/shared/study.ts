import type { SourceAnchor } from "./source";

export type SelfRating = "wrong" | "partial" | "correct";
export type Confidence = "low" | "medium" | "high";

export const ALLOWED_SELF_RATINGS: SelfRating[] = ["wrong", "partial", "correct"];
export const ALLOWED_CONFIDENCE: Confidence[] = ["low", "medium", "high"];

export type ValidationIssue = {
  field: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export type CreateStudyAttemptRequest = {
  checkpointId: string;
  answerMd: string;
  selfRating: SelfRating;
  confidence: Confidence;
};

export type StudyAttemptResponse = {
  id: string;
  checkpointId: string;
  lessonUnitId: string;
  conceptKeys: string[];
  sourceAnchors: SourceAnchor[];
  selfRating: SelfRating;
  confidence: Confidence;
  attemptedAt: string;
};

export type WeakConceptSeedEvent = {
  conceptKey: string;
  lessonUnitId: string;
  checkpointId: string;
  sourceAnchors: SourceAnchor[];
  createdAt: string;
};

export type WeakConcept = {
  conceptKey: string;
  attempts: number;
  latestAttemptAt: string;
  lessonUnitIds: string[];
  sourceAnchors: SourceAnchor[];
};

export type WeakConceptsResponse = {
  concepts: WeakConcept[];
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
    issues.push({ field, message: "Expected a non-empty string." });
    return "";
  }

  return value.trim();
}

export function isSelfRating(value: unknown): value is SelfRating {
  return typeof value === "string" && ALLOWED_SELF_RATINGS.includes(value as SelfRating);
}

export function isConfidence(value: unknown): value is Confidence {
  return typeof value === "string" && ALLOWED_CONFIDENCE.includes(value as Confidence);
}

export function parseCreateStudyAttemptRequest(
  payload: unknown,
): ValidationResult<CreateStudyAttemptRequest> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(payload)) {
    return {
      ok: false,
      issues: [{ field: "body", message: "Expected a JSON object." }],
    };
  }

  const checkpointId = readRequiredString(payload, "checkpointId", issues);
  const answerMd = readRequiredString(payload, "answerMd", issues);
  const selfRatingValue = payload.selfRating;
  const confidenceValue = payload.confidence;

  if (!isSelfRating(selfRatingValue)) {
    issues.push({
      field: "selfRating",
      message: `Expected one of: ${ALLOWED_SELF_RATINGS.join(", ")}.`,
    });
  }

  if (!isConfidence(confidenceValue)) {
    issues.push({
      field: "confidence",
      message: `Expected one of: ${ALLOWED_CONFIDENCE.join(", ")}.`,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      checkpointId,
      answerMd,
      selfRating: selfRatingValue as SelfRating,
      confidence: confidenceValue as Confidence,
    },
  };
}
