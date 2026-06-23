import { Hono } from "hono";

import { registerChapterSourceRoutes } from "./api/chapterSources";
import { registerGenerationRunRoutes } from "./api/generationRuns";
import { registerHealthRoutes } from "./api/health";
import { registerLessonUnitRoutes } from "./api/lessonUnits";
import { MockLessonGenerator } from "./ai/mockLessonGenerator";
import type { LessonGenerator } from "../domain/generation";
import type { ChapterSourceRepository } from "./db/chapterSources";
import type { GenerationPersistence } from "./db/generation";
import {
  createLocalChapterSourceRepository,
  createLocalGenerationRepository,
} from "./db/local";

type ServerAppOptions = {
  chapterSourceRepository?: ChapterSourceRepository;
  generationRepository?: GenerationPersistence;
  lessonGenerator?: LessonGenerator;
};

export function createServerApp(options: ServerAppOptions = {}): Hono {
  const app = new Hono();
  let chapterSourceRepository = options.chapterSourceRepository;
  let generationRepository = options.generationRepository;
  let lessonGenerator = options.lessonGenerator;

  registerHealthRoutes(app);
  registerChapterSourceRoutes(app, {
    getChapterSourceRepository: () => {
      chapterSourceRepository ??= createLocalChapterSourceRepository();
      return chapterSourceRepository;
    },
  });

  registerGenerationRunRoutes(app, {
    getChapterSourceRepository: () => {
      chapterSourceRepository ??= createLocalChapterSourceRepository();
      return chapterSourceRepository;
    },
    getGenerationPersistence: () => {
      generationRepository ??= createLocalGenerationRepository();
      return generationRepository;
    },
    getLessonGenerator: (provider) => {
      // Mock is the PoC provider for issue #3.
      if (provider === "mock") {
        lessonGenerator ??= new MockLessonGenerator();
        return lessonGenerator;
      }

      throw new Error(`Provider '${provider}' is not configured in this deployment.`);
    },
  });
  registerLessonUnitRoutes(app, () => {
    generationRepository ??= createLocalGenerationRepository();
    return generationRepository;
  });

  app.notFound((context) =>
    context.json(
      {
        error: "not_found",
      },
      404,
    ),
  );

  return app;
}
