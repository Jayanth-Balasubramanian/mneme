import { Hono } from "hono";

import { registerChapterSourceRoutes } from "./api/chapterSources";
import { registerHealthRoutes } from "./api/health";
import type { ChapterSourceRepository } from "./db/chapterSources";
import { createLocalChapterSourceRepository } from "./db/local";

type ServerAppOptions = {
  chapterSourceRepository?: ChapterSourceRepository;
};

export function createServerApp(options: ServerAppOptions = {}): Hono {
  const app = new Hono();
  let chapterSourceRepository = options.chapterSourceRepository;

  registerHealthRoutes(app);
  registerChapterSourceRoutes(app, {
    getChapterSourceRepository: () => {
      chapterSourceRepository ??= createLocalChapterSourceRepository();
      return chapterSourceRepository;
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
