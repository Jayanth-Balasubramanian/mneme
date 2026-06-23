import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { prepareChapterSourceImport } from "../../src/domain/source";
import type { LessonGenerator } from "../../src/domain/generation";
import { createServerApp } from "../../src/server/app";
import { SQLiteChapterSourceRepository } from "../../src/server/db/chapterSources";
import { SQLiteGenerationPersistence } from "../../src/server/db/generation";
import { migrateDatabase } from "../../src/server/db/migrations";
import type { LessonGenerationDraft } from "../../src/shared/generation";

const requestBody = {
  bookTitle: "Deep Learning",
  authors: ["Ian Goodfellow", "Yoshua Bengio", "Aaron Courville"],
  publisher: "MIT Press",
  year: 2016,
  chapterTitle: "Monte Carlo Methods",
  chapterNumber: "17",
  sourceUrl: "https://www.deeplearningbook.org/contents/monte_carlo.html",
  citationText:
    "Ian Goodfellow, Yoshua Bengio, and Aaron Courville, Deep Learning, MIT Press, 2016. http://www.deeplearningbook.org",
  emphasisNotes: "Pair formal definitions with intuitive ML examples.",
  markdown:
    "# Synthetic Monte Carlo Notes\n\nA short synthetic paragraph about estimating an expected value.\n\n## Practice focus\n\nA second synthetic paragraph for source anchoring.",
};

type TestRepos = {
  database: Database;
  chapterSources: SQLiteChapterSourceRepository;
  generationRuns: SQLiteGenerationPersistence;
};

function createRepositories(): TestRepos {
  const database = new Database(":memory:");
  migrateDatabase(database);

  return {
    database,
    chapterSources: new SQLiteChapterSourceRepository(database),
    generationRuns: new SQLiteGenerationPersistence(database),
  };
}

function createSourceId(
  chapterSources: SQLiteChapterSourceRepository,
): Promise<{ id: string }> {
  return prepareChapterSourceImport(requestBody).then((prepared) =>
    chapterSources.create(prepared),
  );
}

class TwoUnitLessonGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    return {
      title: "Two unit mock lesson",
      summary: "Unit-level review fixture for PoC.",
      units: [
        {
          title: "Sampling intuition",
          learningObjective: "Explain sampling intuition.",
          conceptKeys: ["sampling-intuition"],
          sourceAnchors: [
            {
              headingPath: ["Synthetic Monte Carlo Notes"],
              paragraphStart: 1,
              paragraphEnd: 1,
              sourceUrl: requestBody.sourceUrl,
            },
          ],
          explanationMd: "A unit explains a core idea.",
          intuitionMd: "Think of repeating random draws.",
          checkpoints: [
            {
              promptMd: "How does sampling relate to Monte Carlo?",
              expectedAnswerMd:
                "Sampling forms random draws to estimate expectations.",
              rubric: [
                {
                  rating: "wrong",
                  description: "No sampling idea is given.",
                },
                {
                  rating: "partial",
                  description: "Mentions sampling in passing.",
                },
                {
                  rating: "correct",
                  description: "Correctly connects sampling to expectation estimates.",
                },
              ],
            },
          ],
        },
        {
          title: "Variance control",
          learningObjective: "Understand variance reduction.",
          conceptKeys: ["variance-control"],
          sourceAnchors: [
            {
              headingPath: ["Synthetic Monte Carlo Notes", "Practice focus"],
              paragraphStart: 2,
              paragraphEnd: 2,
              sourceUrl: requestBody.sourceUrl,
            },
          ],
          explanationMd: "A second unit discusses variance.",
          intuitionMd: "Use control variates and stratification.",
          checkpoints: [
            {
              promptMd: "What is one way to reduce variance?",
              expectedAnswerMd:
                "Use stratification or importance sampling to reduce variance.",
              rubric: [
                {
                  rating: "wrong",
                  description: "No variance-reduction method is provided.",
                },
                {
                  rating: "partial",
                  description: "Mentions one generic ML idea.",
                },
                {
                  rating: "correct",
                  description: "Mentions a valid variance-reduction method.",
                },
              ],
            },
          ],
        },
      ],
    };
  }
}

describe("lesson-unit review workflow", () => {
  test("supports edit, approve, reject, and approved listing", async () => {
    const { database, chapterSources, generationRuns } = createRepositories();
    const source = await createSourceId(chapterSources);

    try {
      const app = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new TwoUnitLessonGenerator(),
      });

      const generationResponse = await app.request("/api/generation-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile:
            "CS undergraduate with applied ML background; prefer formal definitions.",
        }),
      });

      expect(generationResponse.status).toBe(201);
      const generationBody = await generationResponse.json();
      const [firstUnitId, secondUnitId] = generationBody.lessonUnitIds;
      expect(firstUnitId).toBeDefined();
      expect(secondUnitId).toBeDefined();

      const patchApprove = await app.request(`/api/lesson-units/${firstUnitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: "approved",
          title: "Approved sampling intuition",
          explanationMd: "Finalized explanation with stronger examples.",
        }),
      });
      expect(patchApprove.status).toBe(200);
      const approvedUnit = (await patchApprove.json()) as {
        title: string;
        reviewStatus: string;
      };
      expect(approvedUnit.reviewStatus).toBe("approved");
      expect(approvedUnit.title).toBe("Approved sampling intuition");

      const patchReject = await app.request(`/api/lesson-units/${secondUnitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: "rejected",
          reviewerNotes: "Too abstract, add concrete MC intuition.",
        }),
      });
      expect(patchReject.status).toBe(200);
      const rejectedUnit = (await patchReject.json()) as {
        reviewStatus: string;
        reviewerNotes: string;
      };
      expect(rejectedUnit.reviewStatus).toBe("rejected");
      expect(rejectedUnit.reviewerNotes).toBe(
        "Too abstract, add concrete MC intuition.",
      );

      const patchRegenerationNeeded = await app.request(
        `/api/lesson-units/${secondUnitId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewStatus: "needs_regeneration",
            reviewerNotes: "Regenerate with a concrete variance example.",
          }),
        },
      );
      expect(patchRegenerationNeeded.status).toBe(200);
      const regenerationNeededUnit =
        (await patchRegenerationNeeded.json()) as {
          reviewStatus: string;
          reviewerNotes: string;
        };
      expect(regenerationNeededUnit.reviewStatus).toBe("needs_regeneration");
      expect(regenerationNeededUnit.reviewerNotes).toBe(
        "Regenerate with a concrete variance example.",
      );

      const listResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const listBody = (await listResponse.json()) as {
        units: Array<{ id: string; reviewStatus: string }>;
      };

      expect(listBody.units).toHaveLength(2);
      const byId = new Map(listBody.units.map((unit) => [unit.id, unit.reviewStatus]));
      expect(byId.get(firstUnitId)).toBe("approved");
      expect(byId.get(secondUnitId)).toBe("needs_regeneration");

      const studyPathResponse = await app.request(
        `/api/study-paths/${source.id}`,
      );
      expect(studyPathResponse.status).toBe(200);
      const studyPathBody = await studyPathResponse.json() as {
        chapterSourceId: string;
        sourceCredit: {
          title: string;
          [key: string]: unknown;
        };
        units: Array<{ id: string; reviewStatus: string }>;
      };

      expect(studyPathBody).toEqual({
        chapterSourceId: source.id,
        sourceCredit: expect.objectContaining({
          title: "Deep Learning",
        }),
        units: [expect.objectContaining({ id: firstUnitId, reviewStatus: "approved" })],
      });
      expect(studyPathBody.units).toHaveLength(1);

      const approvedFiltered = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}&reviewStatus=approved`,
      );
      const approvedFilteredBody = await approvedFiltered.json() as {
        units: Array<{ id: string; reviewStatus: string }>;
      };

      expect(approvedFiltered.status).toBe(200);
      expect(approvedFilteredBody.units).toHaveLength(1);
      expect(approvedFilteredBody.units[0].id).toBe(firstUnitId);
    } finally {
      database.close();
    }
  });

  test("regenerating one unit preserves other units", async () => {
    const { database, chapterSources, generationRuns } = createRepositories();
    const source = await createSourceId(chapterSources);

    try {
      const app = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new TwoUnitLessonGenerator(),
      });

      const generationResponse = await app.request("/api/generation-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile:
            "CS undergraduate with applied ML background; prefer formal definitions.",
        }),
      });
      const generationBody = await generationResponse.json() as {
        lessonUnitIds: string[];
      };
      const firstUnitId = generationBody.lessonUnitIds[0];
      const secondUnitId = generationBody.lessonUnitIds[1];

      expect([firstUnitId, secondUnitId]).toHaveLength(2);

      const initialListResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const initialList = (await initialListResponse.json()) as {
        units: Array<{ id: string; title: string }>;
      };
      const initialSecondUnit = initialList.units.find(
        (unit) => unit.id === secondUnitId,
      );

      expect(initialSecondUnit?.title).toBe("Variance control");

      const regenerateResponse = await app.request(
        `/api/lesson-units/${firstUnitId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "mock",
            reviewerNotes: "Need stronger phrasing around estimation.",
          }),
        },
      );

      expect(regenerateResponse.status).toBe(200);
      const regenerateBody = await regenerateResponse.json() as {
        replacedUnitId: string;
        lessonUnit: { id: string; title: string; reviewStatus: string };
      };
      expect(regenerateBody.replacedUnitId).toBe(firstUnitId);
      expect(regenerateBody.lessonUnit.title).toContain("Revised");
      expect(regenerateBody.lessonUnit.reviewStatus).toBe("draft");

      const finalListResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const finalList = (await finalListResponse.json()) as {
        units: Array<{ id: string; title: string }>;
      };

      expect(finalList.units).toHaveLength(2);

      const finalSecondUnit = finalList.units.find(
        (unit) => unit.id === secondUnitId,
      );
      const finalFirstUnit = finalList.units.find(
        (unit) => unit.id === firstUnitId,
      );

      expect(finalSecondUnit).toEqual(initialSecondUnit);
      expect(finalFirstUnit?.title).toContain("Sampling intuition");
    } finally {
      database.close();
    }
  });
});
