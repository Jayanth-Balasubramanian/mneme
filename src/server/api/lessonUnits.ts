import type { Hono } from "hono";

import type { GenerationPersistence } from "../db/generation";

export function registerLessonUnitRoutes(
  app: Hono,
  getGenerationPersistence: () => GenerationPersistence,
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

    const units = await getGenerationPersistence().listUnitsByChapterSourceId(
      chapterSourceId,
    );

    return context.json({ units });
  });
}

