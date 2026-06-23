import type { Hono } from "hono";

import type { LessonGenerator } from "../../domain/generation";
import type { ChapterSourceRepository } from "../db/chapterSources";
import type { SourceAnchor } from "../../shared/source";
import {
  type ValidationIssue,
  GenerationRunResponse,
  parseCreateGenerationRunRequest,
  parseLessonGenerationDraft,
} from "../../shared/generation";
import type { GenerationPersistence } from "../db/generation";

const promptVersion = "mock-v1";
const GENERATOR_FAILURE_REASON = "generation_provider_failed";

type GenerationDependencies = {
  getChapterSourceRepository: () => ChapterSourceRepository;
  getGenerationPersistence: () => GenerationPersistence;
  getLessonGenerator: (provider: "mock" | "openai") => LessonGenerator;
};

function sameHeadingPath(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function validateSourceAnchorAgainstChapter(
  unitsAnchorPath: string,
  chapterAnchorsByParagraph: Map<number, SourceAnchor>,
  chapterSourceUrl: string,
  sourceAnchor: SourceAnchor,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (sourceAnchor.sourceUrl !== chapterSourceUrl) {
    issues.push({
      field: `${unitsAnchorPath}.sourceUrl`,
      message: "Source anchor sourceUrl must match the imported chapter sourceUrl.",
    });
    return issues;
  }

  for (let paragraph = sourceAnchor.paragraphStart; paragraph <= sourceAnchor.paragraphEnd; paragraph += 1) {
    const chapterAnchor = chapterAnchorsByParagraph.get(paragraph);

    if (!chapterAnchor) {
      issues.push({
        field: `${unitsAnchorPath}.paragraphStart`,
        message:
          "Source anchor paragraph range must match the current chapter source anchors.",
      });

      return issues;
    }

    if (!sameHeadingPath(chapterAnchor.headingPath, sourceAnchor.headingPath)) {
      issues.push({
        field: `${unitsAnchorPath}.headingPath`,
        message:
          "Source anchor headingPath must align with chapter-derived source anchors.",
      });
      return issues;
    }
  }

  return issues;
}

function validateGeneratedAnchorsBelongToChapter(
  units: Array<{ sourceAnchors: SourceAnchor[] }>,
  chapterContext: {
    sourceUrl: string;
    anchors: SourceAnchor[];
  },
): ValidationIssue[] {
  const chapterAnchorsByParagraph = new Map<number, SourceAnchor>();

  for (const chapterAnchor of chapterContext.anchors) {
    if (chapterAnchor.sourceUrl !== chapterContext.sourceUrl) {
      continue;
    }

    chapterAnchorsByParagraph.set(chapterAnchor.paragraphStart, chapterAnchor);
  }

  const issues: ValidationIssue[] = [];

  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const unit = units[unitIndex];

    for (
      let anchorIndex = 0;
      anchorIndex < unit.sourceAnchors.length;
      anchorIndex += 1
    ) {
      const sourceAnchor = unit.sourceAnchors[anchorIndex];
      const anchorPath = `units[${unitIndex}].sourceAnchors[${anchorIndex}]`;

      issues.push(
        ...validateSourceAnchorAgainstChapter(
          anchorPath,
          chapterAnchorsByParagraph,
          chapterContext.sourceUrl,
          sourceAnchor,
        ),
      );
    }
  }

  return issues;
}

function buildInputSummary(learnerProfile: string, chapterTitle: string): string {
  return `learnerProfile=${learnerProfile}; chapter=${chapterTitle}`;
}

function buildGenerationRunResponse(
  run: { id: string; provider: string; model?: string; promptVersion: string; status: "succeeded" | "failed"; createdAt: string; errorMessage?: string; },
  chapterSourceId: string,
  lessonUnitIds: string[],
): GenerationRunResponse {
  return {
    id: run.id,
    chapterSourceId,
    provider: run.provider,
    model: run.model,
    promptVersion: run.promptVersion,
    status: run.status,
    lessonUnitIds,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt,
  };
}

export function registerGenerationRunRoutes(
  app: Hono,
  dependencies: GenerationDependencies,
): void {
  app.post("/api/generation-runs", async (context) => {
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

    const parsed = parseCreateGenerationRunRequest(payload);

    if (!parsed.ok) {
      return context.json(
        {
          error: "validation_failed",
          issues: parsed.issues,
        },
        400,
      );
    }

    const chapterContext =
      await dependencies
        .getChapterSourceRepository()
        .findGenerationContextById(parsed.value.chapterSourceId);

    if (!chapterContext) {
      return context.json({ error: "chapter_source_not_found" }, 404);
    }

    if (parsed.value.provider === "openai") {
      return context.json(
        { error: "provider_not_supported", reason: "provider_not_implemented" },
        400,
      );
    }

    const generator = dependencies.getLessonGenerator(parsed.value.provider);
    const inputSummary = buildInputSummary(
      parsed.value.learnerProfile,
      chapterContext.chapterTitle,
    );

    let rawOutput: unknown;

    try {
      rawOutput = await generator.generate({
        chapterTitle: chapterContext.chapterTitle,
        bookTitle: chapterContext.bookTitle,
        markdown: chapterContext.markdown,
        learnerProfile: parsed.value.learnerProfile,
        sourceAnchors: chapterContext.anchors,
      });
    } catch {
      const createdRun = await dependencies
        .getGenerationPersistence()
        .createGenerationRun({
          chapterSourceId: parsed.value.chapterSourceId,
          provider: parsed.value.provider,
          promptVersion,
          status: "failed",
          inputSummary,
          rawOutputJson: JSON.stringify({ generatorError: GENERATOR_FAILURE_REASON }),
          errorMessage: GENERATOR_FAILURE_REASON,
        });
      return context.json(
        buildGenerationRunResponse(createdRun, parsed.value.chapterSourceId, []),
        201,
      );
    }

    const validated = parseLessonGenerationDraft(rawOutput);

    if (!validated.ok) {
      const createdRun = await dependencies
        .getGenerationPersistence()
        .createGenerationRun({
          chapterSourceId: parsed.value.chapterSourceId,
          provider: parsed.value.provider,
          promptVersion,
          status: "failed",
          inputSummary,
          rawOutputJson: JSON.stringify(rawOutput),
          errorMessage: validated.issues
            .map((issue) => `${issue.field}: ${issue.message}`)
            .join("; "),
        });

      return context.json(
        buildGenerationRunResponse(createdRun, parsed.value.chapterSourceId, []),
        201,
      );
    }

    const sourceAnchorIssues = validateGeneratedAnchorsBelongToChapter(
      validated.value.units,
      {
        sourceUrl: chapterContext.sourceUrl,
        anchors: chapterContext.anchors,
      },
    );

    if (sourceAnchorIssues.length > 0) {
      const createdRun = await dependencies
        .getGenerationPersistence()
        .createGenerationRun({
          chapterSourceId: parsed.value.chapterSourceId,
          provider: parsed.value.provider,
          promptVersion,
          status: "failed",
          inputSummary,
          rawOutputJson: JSON.stringify(rawOutput),
          errorMessage: sourceAnchorIssues
            .map((issue) => `${issue.field}: ${issue.message}`)
            .join("; "),
        });

      return context.json(
        buildGenerationRunResponse(createdRun, parsed.value.chapterSourceId, []),
        201,
      );
    }

    const createdRun = await dependencies
      .getGenerationPersistence()
      .createGenerationRun({
        chapterSourceId: parsed.value.chapterSourceId,
        provider: parsed.value.provider,
        promptVersion,
        status: "succeeded",
        inputSummary,
        rawOutputJson: JSON.stringify(rawOutput),
      });

    const lessonUnits = validated.value.units.map((unit, index) => ({
      ...unit,
      orderIndex: index,
    }));

    const lessonUnitIds = await dependencies
      .getGenerationPersistence()
      .createDraftLessonUnits({
        chapterSourceId: parsed.value.chapterSourceId,
        generationRunId: createdRun.id,
        units: lessonUnits,
      });

    return context.json(
      buildGenerationRunResponse(createdRun, parsed.value.chapterSourceId, lessonUnitIds),
      201,
    );
  });
}
