import type { Hono } from "hono";

import type { LessonGenerator } from "../../domain/generation";
import type { ChapterSourceRepository } from "../db/chapterSources";
import {
  GenerationRunResponse,
  parseCreateGenerationRunRequest,
  parseLessonGenerationDraft,
} from "../../shared/generation";
import type { GenerationPersistence } from "../db/generation";

const promptVersion = "mock-v1";

type GenerationDependencies = {
  getChapterSourceRepository: () => ChapterSourceRepository;
  getGenerationPersistence: () => GenerationPersistence;
  getLessonGenerator: (provider: "mock" | "openai") => LessonGenerator;
};

function buildInputSummary(learnerProfile: string, chapterTitle: string): string {
  return `learnerProfile=${learnerProfile}; chapter=${chapterTitle}`;
}

function buildGeneratorErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return `GeneratorError: ${String(error)}`;
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
    } catch (error) {
      const errorMessage = buildGeneratorErrorMessage(error);
      const createdRun = await dependencies
        .getGenerationPersistence()
        .createGenerationRun({
          chapterSourceId: parsed.value.chapterSourceId,
          provider: parsed.value.provider,
          promptVersion,
          status: "failed",
          inputSummary,
          rawOutputJson: JSON.stringify({ generatorError: errorMessage }),
          errorMessage,
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
