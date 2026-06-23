import type { Hono } from "hono";

import { deriveWeakConcepts } from "../../domain/study";
import {
  parseCreateStudyAttemptRequest,
  type WeakConceptsResponse,
} from "../../shared/study";
import type { ChapterSourceRepository } from "../db/chapterSources";
import type { StudyAttemptRepository } from "../db/studyAttempts";

type StudyAttemptRouteDependencies = {
  getChapterSourceRepository: () => ChapterSourceRepository;
  getStudyAttemptRepository: () => StudyAttemptRepository;
};

function parseChapterSourceId(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }

  const chapterSourceId = raw.trim();
  return chapterSourceId.length > 0 ? chapterSourceId : null;
}

export function registerStudyAttemptRoutes(
  app: Hono,
  dependencies: StudyAttemptRouteDependencies,
): void {
  app.post("/api/study-attempts", async (context) => {
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

    const parsed = parseCreateStudyAttemptRequest(payload);
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
      const attempt = await dependencies
        .getStudyAttemptRepository()
        .createAttempt(parsed.value);

      if (!attempt) {
        return context.json({ error: "checkpoint_not_found" }, 404);
      }

      return context.json(attempt, 201);
    } catch {
      return context.json(
        { error: "study_attempt_failed" },
        500,
      );
    }
  });

  app.get("/api/weak-concepts", async (context) => {
    const chapterSourceId = parseChapterSourceId(
      context.req.query("chapterSourceId"),
    );

    if (!chapterSourceId) {
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

    const chapterSource = await dependencies
      .getChapterSourceRepository()
      .findById(chapterSourceId);

    if (!chapterSource) {
      return context.json(
        { error: "chapter_source_not_found" },
        404,
      );
    }

    try {
      const events = await dependencies
        .getStudyAttemptRepository()
        .listWeakConceptSeedEventsByChapterSourceId(chapterSourceId);
      const concepts = deriveWeakConcepts(events);

      const response: WeakConceptsResponse = { concepts };
      return context.json(response, 200);
    } catch {
      return context.json({ error: "weak_concepts_query_failed" }, 500);
    }
  });
}
