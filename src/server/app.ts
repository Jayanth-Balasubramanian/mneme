import { Hono } from "hono";

import { registerChapterSourceRoutes } from "./api/chapterSources";
import { registerGenerationRunRoutes } from "./api/generationRuns";
import { registerHealthRoutes } from "./api/health";
import { registerLessonUnitRoutes } from "./api/lessonUnits";
import { registerStudyAttemptRoutes } from "./api/studyAttempts";
import { registerReaderRoutes, rejectForeignOrigin, type ReaderPdfValidator } from "./api/reader";
import { registerCompanionRoutes } from "./api/companion";
import { MockLessonGenerator } from "./ai/mockLessonGenerator";
import type { LessonGenerator } from "../domain/generation";
import type { ChapterSourceRepository } from "./db/chapterSources";
import type { GenerationPersistence } from "./db/generation";
import type { StudyAttemptRepository } from "./db/studyAttempts";
import type { SQLiteReaderRepository } from "./db/reader";
import type { SQLiteConversationRepository } from "./db/conversations";
import type { CompanionProvider } from "./ai/companion";
import { createConfiguredDeepSeekProvider, createConfiguredOpenAIProvider, DemoCompanionProvider } from "./ai/companion";
import type { CodexChatService } from "./ai/codex";
import { createConfiguredCodexService, DemoCodexChatService } from "./ai/codex";
import type { SQLiteCodexThreadRepository } from "./db/codexThreads";
import {
  createLocalChapterSourceRepository,
  createLocalConversationRepository,
  createLocalCodexThreadRepository,
  createLocalGenerationRepository,
  createLocalReaderRepository,
  createLocalStudyAttemptRepository,
} from "./db/local";

type ServerAppOptions = {
  chapterSourceRepository?: ChapterSourceRepository;
  generationRepository?: GenerationPersistence;
  studyAttemptRepository?: StudyAttemptRepository;
  readerRepository?: SQLiteReaderRepository;
  readerPdfValidator?: ReaderPdfValidator;
  conversationRepository?: SQLiteConversationRepository;
  companionProviders?: Partial<Record<"demo" | "openai" | "deepseek", CompanionProvider>>;
  codexChatService?: CodexChatService;
  codexThreadRepository?: SQLiteCodexThreadRepository;
  lessonGenerator?: LessonGenerator;
};

export function createServerApp(options: ServerAppOptions = {}): Hono {
  const app = new Hono();

  app.use("*", async (context, next) => {
    const pathname = new URL(context.req.url).pathname;
    if (pathname.startsWith("/api/reader/") || pathname === "/api/reader" || pathname.startsWith("/api/companion/") || pathname === "/api/companion") {
      const forbidden = rejectForeignOrigin(context);
      if (forbidden) return forbidden;
    }
    await next();
  });
  let chapterSourceRepository = options.chapterSourceRepository;
  let generationRepository = options.generationRepository;
  let lessonGenerator = options.lessonGenerator;
  let studyAttemptRepository = options.studyAttemptRepository;
  let readerRepository = options.readerRepository;
  let conversationRepository = options.conversationRepository;
  let codexThreadRepository = options.codexThreadRepository;
  let codexChatService = options.codexChatService;
  const companionProviders = options.companionProviders ?? {};

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
  registerLessonUnitRoutes(app, {
    getChapterSourceRepository: () => {
      chapterSourceRepository ??= createLocalChapterSourceRepository();
      return chapterSourceRepository;
    },
    getGenerationPersistence: () => {
      generationRepository ??= createLocalGenerationRepository();
      return generationRepository;
    },
    getLessonGenerator: (provider) => {
      if (provider === "mock") {
        lessonGenerator ??= new MockLessonGenerator();
        return lessonGenerator;
      }

      throw new Error(`Provider '${provider}' is not configured in this deployment.`);
    },
  });
  registerStudyAttemptRoutes(app, {
    getStudyAttemptRepository: () => {
      studyAttemptRepository ??= createLocalStudyAttemptRepository();
      return studyAttemptRepository;
    },
    getChapterSourceRepository: () => {
      chapterSourceRepository ??= createLocalChapterSourceRepository();
      return chapterSourceRepository;
    },
  });

  registerReaderRoutes(app, {
    getReaderRepository: () => {
      readerRepository ??= createLocalReaderRepository();
      return readerRepository;
    },
    validatePdf: options.readerPdfValidator,
  });

  registerCompanionRoutes(app, {
    getReaderRepository: () => {
      readerRepository ??= createLocalReaderRepository();
      return readerRepository;
    },
    getConversationRepository: () => {
      conversationRepository ??= createLocalConversationRepository();
      return conversationRepository;
    },
    getProvider: (provider) => {
      if (provider === "demo") return companionProviders.demo ?? new DemoCompanionProvider();
      if (provider === "openai") return companionProviders.openai ?? createConfiguredOpenAIProvider();
      if (provider === "codex") return undefined;
      return companionProviders.deepseek ?? createConfiguredDeepSeekProvider();
    },
    getChatService: () => {
      if (Bun.env.MNEME_COMPANION_PROVIDER === "demo") return codexChatService ??= new DemoCodexChatService();
      return codexChatService ??= createConfiguredCodexService();
    },
    getCodexThreadRepository: () => {
      codexThreadRepository ??= createLocalCodexThreadRepository();
      return codexThreadRepository;
    },
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
