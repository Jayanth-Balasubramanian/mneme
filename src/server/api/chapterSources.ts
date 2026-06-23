import type { Hono } from "hono";

import {
  prepareChapterSourceImport,
  SourceImportError,
} from "../../domain/source";
import { parseCreateChapterSourceRequest } from "../../shared/source";
import type { ChapterSourceRepository } from "../db/chapterSources";

type ChapterSourceRouteDependencies = {
  getChapterSourceRepository: () => ChapterSourceRepository;
};

export function registerChapterSourceRoutes(
  app: Hono,
  dependencies: ChapterSourceRouteDependencies,
): void {
  app.post("/api/chapter-sources", async (context) => {
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

    const parsed = parseCreateChapterSourceRequest(payload);

    if (!parsed.ok) {
      return context.json(
        {
          error: "validation_failed",
          issues: parsed.issues,
        },
        400,
      );
    }

    try {
      const prepared = await prepareChapterSourceImport(parsed.value);
      const created = await dependencies
        .getChapterSourceRepository()
        .create(prepared);

      return context.json(created, 201);
    } catch (error) {
      if (error instanceof SourceImportError) {
        return context.json(
          {
            error: "validation_failed",
            issues: [{ field: "markdown", message: error.message }],
          },
          400,
        );
      }

      console.error(error);
      return context.json({ error: "chapter_source_create_failed" }, 500);
    }
  });
}
