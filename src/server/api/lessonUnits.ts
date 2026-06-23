import type { Hono } from "hono";

import type { LessonGenerator } from "../../domain/generation";
import { extractSourceContextFromAnchors } from "../../domain/source";
import type { ChapterSourceRepository } from "../db/chapterSources";
import {
  ALLOWED_REVIEW_STATUSES,
  isReviewStatus,
  parseLessonGenerationDraft,
  parseRegenerateLessonUnitRequest,
  parseUpdateLessonUnitRequest,
  type ValidationIssue,
  type RegenerateLessonUnitResponse,
  type ReviewStatus,
  type StudyPathResponse,
} from "../../shared/generation";
import type { GenerationPersistence } from "../db/generation";
import { validateGeneratedAnchorsBelongToChapter } from "./generationValidation";

type LessonUnitRouteDependencies = {
  getChapterSourceRepository: () => ChapterSourceRepository;
  getGenerationPersistence: () => GenerationPersistence;
  getLessonGenerator: (provider: "mock" | "openai") => LessonGenerator;
};

const promptVersion = "mock-v1";
const GENERATOR_FAILURE_REASON = "generation_provider_failed";

function buildGenerationInputSummary(
  unitId: string,
  provider: "mock" | "openai",
  notes?: string,
): string {
  const reviewed = notes?.trim();

  return reviewed
    ? `regenerate:${unitId};provider=${provider};reviewerNotes=${reviewed}`
    : `regenerate:${unitId};provider=${provider}`;
}

function buildLessonUnitErrorResponse(
  unitId: string,
  message: string,
): { error: string; lessonUnitId: string; issues: { field: string; message: string }[] } {
  return {
    error: "lesson_unit_not_found",
    lessonUnitId: unitId,
    issues: [{ field: "id", message }],
  };
}

function parseReviewStatusQuery(
  queryValue: string | undefined,
): ReviewStatus[] | null {
  if (!queryValue) {
    return null;
  }

  if (!isReviewStatus(queryValue)) {
    return [];
  }

  return [queryValue];
}

function summarizeValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return "validation_failed";
  }

  return issues.map((issue) => `${issue.field}: ${issue.message}`).join("; ");
}

function buildRegenerationMarkdown(input: {
  chapterMarkdown: string;
  original: {
    title: string;
    learningObjective: string;
    conceptKeys: string[];
    sourceAnchors: Array<{
      headingPath: string[];
      paragraphStart: number;
      paragraphEnd: number;
      sourceUrl: string;
    }>;
    explanationMd: string;
    intuitionMd: string;
    notationMd?: string;
    exampleMd?: string;
    misconceptionMd?: string;
  };
}): string {
  const snippets = extractSourceContextFromAnchors(
    input.chapterMarkdown,
    input.original.sourceAnchors,
    {
      contextRadius: 1,
      maxParagraphs: 8,
    },
  );
  const sourceContext = snippets.map((snippet) => {
    const heading = snippet.headingPath.length > 0
      ? snippet.headingPath.join(" > ")
      : "Untitled section";

    return `Paragraph ${snippet.paragraphIndex} (${heading})\n${snippet.text}`;
  });

  return [
    `# Existing lesson unit: ${input.original.title}`,
    `Learning objective: ${input.original.learningObjective}`,
    `Concept keys: ${input.original.conceptKeys.join(", ")}`,
    "## Existing explanation",
    input.original.explanationMd,
    "## Existing intuition",
    input.original.intuitionMd,
    input.original.notationMd ? `## Existing notation\n${input.original.notationMd}` : "",
    input.original.exampleMd ? `## Existing example\n${input.original.exampleMd}` : "",
    input.original.misconceptionMd
      ? `## Existing misconception\n${input.original.misconceptionMd}`
      : "",
    "## Bounded source context",
    ...sourceContext,
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
}


export function registerLessonUnitRoutes(
  app: Hono,
  dependencies: LessonUnitRouteDependencies,
): void {
  app.get("/api/lesson-units", async (context) => {
    const chapterSourceId = context.req.query("chapterSourceId");

    if (!chapterSourceId || chapterSourceId.trim().length === 0) {
      return context.json(
        {
          error: "validation_failed",
          issues: [
            {
              field: "chapterSourceId",
              message: "Expected a chapterSourceId query parameter.",
            },
          ],
        },
        400,
      );
    }

    const statusParam = context.req.query("reviewStatus");
    const reviewStatuses = parseReviewStatusQuery(statusParam);

    if (reviewStatuses !== null && reviewStatuses.length === 0) {
      return context.json(
        {
          error: "validation_failed",
          issues: [
            {
              field: "reviewStatus",
              message: `Expected one of: ${ALLOWED_REVIEW_STATUSES.join(", ")}.`,
            },
          ],
        },
        400,
      );
    }

    const response = await dependencies
      .getGenerationPersistence()
      .listUnitsByChapterSourceId(chapterSourceId, reviewStatuses ?? undefined);

    return context.json({ units: response }, 200);
  });

  app.get("/api/study-paths/:chapterSourceId", async (context) => {
    const chapterSourceId = context.req.param("chapterSourceId");

    if (!chapterSourceId || chapterSourceId.trim().length === 0) {
      return context.json(
        {
          error: "validation_failed",
          issues: [
            {
              field: "chapterSourceId",
              message: "Expected a chapterSourceId path parameter.",
            },
          ],
        },
        400,
      );
    }

    const chapterSource = await dependencies
      .getChapterSourceRepository()
      .findById(chapterSourceId);

    if (!chapterSource) {
      return context.json({ error: "chapter_source_not_found" }, 404);
    }

    const units = await dependencies
      .getGenerationPersistence()
      .listUnitsByChapterSourceId(chapterSourceId, ["approved"]);

    const response: StudyPathResponse = {
      chapterSourceId,
      sourceCredit: chapterSource.sourceCredit,
      units,
    };

    return context.json(response, 200);
  });

  app.patch("/api/lesson-units/:id", async (context) => {
    let payload: unknown;

    try {
      payload = await context.req.json();
    } catch {
      return context.json(
        {
          error: "invalid_json",
          issues: [{ field: "body", message: "Expected valid JSON." }],
        },
        400,
      );
    }

    const parsed = parseUpdateLessonUnitRequest(payload);

    if (!parsed.ok) {
      return context.json(
        {
          error: "validation_failed",
          issues: parsed.issues,
        },
        400,
      );
    }

    const unitId = context.req.param("id");
    const lessonUnit = await dependencies
      .getGenerationPersistence()
      .updateLessonUnitById(unitId, parsed.value);

    if (!lessonUnit) {
      return context.json(
        buildLessonUnitErrorResponse(unitId, "Lesson unit not found."),
        404,
      );
    }

    return context.json(lessonUnit, 200);
  });

  app.post("/api/lesson-units/:id/regenerate", async (context) => {
    let payload: unknown;

    try {
      payload = await context.req.json();
    } catch {
      return context.json(
        {
          error: "invalid_json",
          issues: [{ field: "body", message: "Expected valid JSON." }],
        },
        400,
      );
    }

    const parsed = parseRegenerateLessonUnitRequest(payload);

    if (!parsed.ok) {
      return context.json(
        {
          error: "validation_failed",
          issues: parsed.issues,
        },
        400,
      );
    }

    if (parsed.value.provider === "openai") {
      return context.json(
        {
          error: "provider_not_supported",
          reason: "provider_not_implemented",
        },
        400,
      );
    }

    const unitId = context.req.param("id");
    const generationPersistence = dependencies.getGenerationPersistence();
    const original = await generationPersistence.findLessonUnitById(unitId);

    if (!original) {
      return context.json(
        buildLessonUnitErrorResponse(unitId, "Lesson unit not found."),
        404,
      );
    }

    const chapterContext =
      await dependencies
        .getChapterSourceRepository()
        .findGenerationContextById(original.chapterSourceId);

    if (!chapterContext) {
      return context.json(
        { error: "chapter_source_not_found" },
        404,
      );
    }

    const generator = dependencies.getLessonGenerator(parsed.value.provider);
    let rawOutput: unknown;
    const inputSummary = buildGenerationInputSummary(
      original.id,
      parsed.value.provider,
      parsed.value.reviewerNotes,
    );

    try {
      rawOutput = await generator.generate({
        chapterTitle: chapterContext.chapterTitle,
        bookTitle: chapterContext.bookTitle,
        markdown: buildRegenerationMarkdown({
          chapterMarkdown: chapterContext.markdown,
          original,
        }),
        learnerProfile:
          parsed.value.reviewerNotes
            ? `Regenerate with reviewer notes: ${parsed.value.reviewerNotes}`
            : "Review-directed regeneration.",
        sourceAnchors: original.sourceAnchors,
      });
    } catch {
      const failedRun = await generationPersistence.createGenerationRun({
        chapterSourceId: original.chapterSourceId,
        provider: parsed.value.provider,
        promptVersion,
        status: "failed",
        inputSummary,
        rawOutputJson: JSON.stringify({ generatorError: GENERATOR_FAILURE_REASON }),
        errorMessage: GENERATOR_FAILURE_REASON,
      });

      return context.json(
        {
          error: "generation_failed",
          generationRunId: failedRun.id,
          message: failedRun.errorMessage,
          provider: failedRun.provider,
        },
        502,
      );
    }

    const validatedDraft = parseLessonGenerationDraft(rawOutput);

    if (!validatedDraft.ok) {
      const failedRun = await generationPersistence.createGenerationRun({
        chapterSourceId: original.chapterSourceId,
        provider: parsed.value.provider,
        promptVersion,
        status: "failed",
        inputSummary,
        rawOutputJson: JSON.stringify(rawOutput),
        errorMessage: summarizeValidationIssues(validatedDraft.issues),
      });

      return context.json(
        {
          error: "generation_validation_failed",
          generationRunId: failedRun.id,
          issues: validatedDraft.issues,
        },
        400,
      );
    }

    if (validatedDraft.value.units.length !== 1) {
      const failedRun = await generationPersistence.createGenerationRun({
        chapterSourceId: original.chapterSourceId,
        provider: parsed.value.provider,
        promptVersion,
        status: "failed",
        inputSummary,
        rawOutputJson: JSON.stringify(rawOutput),
        errorMessage:
          "Expected a single regenerated unit in the regeneration response.",
      });

      return context.json(
        {
          error: "generation_validation_failed",
          generationRunId: failedRun.id,
          message: failedRun.errorMessage,
        },
        400,
      );
    }

    const sourceAnchorIssues = validateGeneratedAnchorsBelongToChapter(
      validatedDraft.value.units,
      {
        sourceUrl: chapterContext.sourceUrl,
        anchors: chapterContext.anchors,
      },
    );

    if (sourceAnchorIssues.length > 0) {
      const failedRun = await generationPersistence.createGenerationRun({
        chapterSourceId: original.chapterSourceId,
        provider: parsed.value.provider,
        promptVersion,
        status: "failed",
        inputSummary,
        rawOutputJson: JSON.stringify(rawOutput),
        errorMessage: summarizeValidationIssues(sourceAnchorIssues),
      });

      return context.json(
        {
          error: "generation_validation_failed",
          generationRunId: failedRun.id,
          issues: sourceAnchorIssues,
        },
        400,
      );
    }

    const regenerated = validatedDraft.value.units[0];
    const generationRun = await generationPersistence.createGenerationRun({
      chapterSourceId: original.chapterSourceId,
      provider: parsed.value.provider,
      promptVersion,
      status: "succeeded",
      inputSummary,
      rawOutputJson: JSON.stringify(rawOutput),
    });

    const lessonUnit = await generationPersistence.replaceLessonUnitById(
      unitId,
      {
        generationRunId: generationRun.id,
        title: regenerated.title,
        learningObjective: regenerated.learningObjective,
        conceptKeys: regenerated.conceptKeys,
        sourceAnchors: regenerated.sourceAnchors,
        explanationMd: regenerated.explanationMd,
        intuitionMd: regenerated.intuitionMd,
        notationMd: regenerated.notationMd,
        exampleMd: regenerated.exampleMd,
        misconceptionMd: regenerated.misconceptionMd,
        reviewerNotes:
          parsed.value.reviewerNotes ?? original.reviewerNotes ?? null,
        checkpoints: regenerated.checkpoints,
        reviewStatus: "draft",
      },
    );

    if (!lessonUnit) {
      return context.json(
        buildLessonUnitErrorResponse(unitId, "Unit update failed."),
        500,
      );
    }

    const response: RegenerateLessonUnitResponse = {
      replacedUnitId: lessonUnit.id,
      lessonUnit,
      generationRunId: generationRun.id,
    };

    return context.json(response, 200);
  });
}
