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

class InvalidRegenerationGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    return {
      title: "Invalid regen draft",
      summary: "Regeneration failed because no units were returned.",
      units: [],
    };
  }
}

class ForeignAnchorRegenerationGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    return {
      title: "Foreign anchors",
      summary: "Regenerated unit references a foreign source URL.",
      units: [
        {
          title: "Regenerated with foreign anchor",
          learningObjective: "Validate provenance checks.",
          conceptKeys: ["provenance"],
          sourceAnchors: [
            {
              headingPath: ["Synthetic Monte Carlo Notes"],
              paragraphStart: 1,
              paragraphEnd: 1,
              sourceUrl: "https://malicious.example.com/chapter",
            },
          ],
          explanationMd: "This unit was generated from a bad source.",
          intuitionMd: "It should fail source-url provenance.",
          checkpoints: [
            {
              promptMd: "What is provenance?",
              expectedAnswerMd: "Provenance links concepts to the chapter source.",
              rubric: [
                {
                  rating: "wrong",
                  description: "No source provenance.",
                },
                {
                  rating: "partial",
                  description: "Mentions provenance in general.",
                },
                {
                  rating: "correct",
                  description: "Matches source provenance requirements.",
                },
              ],
            },
          ],
        },
      ],
    };
  }
}

class OutOfRangeAnchorRegenerationGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    return {
      title: "Invalid regenerated range",
      summary: "Regenerated unit has an out-of-range source paragraph.",
      units: [
        {
          title: "Regenerated out-of-range",
          learningObjective: "Validate paragraph range checks.",
          conceptKeys: ["range-check"],
          sourceAnchors: [
            {
              headingPath: ["Synthetic Monte Carlo Notes"],
              paragraphStart: 99,
              paragraphEnd: 101,
              sourceUrl: requestBody.sourceUrl,
            },
          ],
          explanationMd: "This unit should fail paragraph-range checks.",
          intuitionMd: "It should map to an unavailable paragraph.",
          checkpoints: [
            {
              promptMd: "What happens with impossible anchors?",
              expectedAnswerMd:
                "Validation should reject anchors outside imported paragraphs.",
              rubric: [
                {
                  rating: "wrong",
                  description: "No anchor validation.",
                },
                {
                  rating: "partial",
                  description: "Mentions anchor checks in passing.",
                },
                {
                  rating: "correct",
                  description: "Clearly fails invalid anchor validation.",
                },
              ],
            },
          ],
        },
      ],
    };
  }
}

class SingleUnitRegenerationGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    return {
      title: "Single unit regenerated draft",
      summary: "Single regenerated output for workflow preservation.",
      units: [
        {
          title: "Sampling intuition (Revised)",
          learningObjective: "Revise the original explanation and preserve provenance.",
          conceptKeys: ["sampling-intuition"],
          sourceAnchors: [
            {
              headingPath: ["Synthetic Monte Carlo Notes"],
              paragraphStart: 1,
              paragraphEnd: 1,
              sourceUrl: requestBody.sourceUrl,
            },
          ],
          explanationMd: "Revised explanation with a narrower wording.",
          intuitionMd: "Revised intuition emphasizing repeated sampling.",
          checkpoints: [
            {
              promptMd: "What is the revised intuition for sampling?",
              expectedAnswerMd: "Revised answer from regeneration.",
              rubric: [
                {
                  rating: "wrong",
                  description: "Missing the revised concept.",
                },
                {
                  rating: "partial",
                  description: "Mentions sampling briefly.",
                },
                {
                  rating: "correct",
                  description: "Reiterates sampling intuition clearly.",
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
      const generationApp = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new TwoUnitLessonGenerator(),
      });

      const regenerationApp = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new SingleUnitRegenerationGenerator(),
      });

      const generationResponse = await generationApp.request("/api/generation-runs", {
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

      const initialListResponse = await generationApp.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const initialList = (await initialListResponse.json()) as {
        units: Array<{ id: string; title: string }>;
      };
      const initialSecondUnit = initialList.units.find(
        (unit) => unit.id === secondUnitId,
      );

      expect(initialSecondUnit?.title).toBe("Variance control");

      const regenerateResponse = await regenerationApp.request(
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

      const finalListResponse = await generationApp.request(
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

  test("edits checkpoint content before approving and persists edits to study path", async () => {
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

      const generationBody = (await generationResponse.json()) as {
        lessonUnitIds: string[];
      };
      const firstUnitId = generationBody.lessonUnitIds[0];

      const listResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const listBody = (await listResponse.json()) as {
        units: Array<{ id: string; checkpoints: Array<{ id: string }> }>;
      };

      const firstUnit = listBody.units.find((unit) => unit.id === firstUnitId);
      expect(firstUnit).toBeDefined();

      const checkpointId = firstUnit!.checkpoints[0]?.id;
      expect(checkpointId).toBeDefined();

      const patchResponse = await app.request(`/api/lesson-units/${firstUnitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewStatus: "approved",
          checkpointPatches: [
            {
              checkpointId,
              promptMd: "Why is Monte Carlo useful for estimation?",
              expectedAnswerMd: "It estimates integrals with random samples.",
              rubric: [
                {
                  rating: "wrong",
                  description: "Doesn't mention samples or estimates.",
                },
                {
                  rating: "partial",
                  description: "Mentions Monte Carlo without averaging.",
                },
                {
                  rating: "correct",
                  description:
                    "Explains random sampling and averaging for estimation.",
                },
              ],
            },
          ],
        }),
      });

      expect(patchResponse.status).toBe(200);
      const patched = (await patchResponse.json()) as {
        id: string;
        reviewStatus: string;
        checkpoints: Array<{
          promptMd: string;
          expectedAnswerMd: string;
          rubric: Array<{ rating: string; description: string }>;
        }>;
      };

      expect(patched.reviewStatus).toBe("approved");
      expect(patched.checkpoints[0].promptMd).toBe(
        "Why is Monte Carlo useful for estimation?",
      );
      expect(patched.checkpoints[0].rubric).toContainEqual({
        rating: "correct",
        description: "Explains random sampling and averaging for estimation.",
      });

      const studyPathResponse = await app.request(
        `/api/study-paths/${source.id}`,
      );
      const studyPathBody = (await studyPathResponse.json()) as {
        units: Array<{
          id: string;
          reviewStatus: string;
          checkpoints: Array<{
            promptMd: string;
            expectedAnswerMd: string;
            rubric: Array<{ rating: string; description: string }>;
          }>;
        }>;
      };

      expect(studyPathResponse.status).toBe(200);
      expect(studyPathBody.units).toHaveLength(1);

      const approvedUnit = studyPathBody.units.find(
        (unit) => unit.id === firstUnitId,
      );
      expect(approvedUnit).toBeDefined();
      expect(approvedUnit?.reviewStatus).toBe("approved");
      expect(approvedUnit?.checkpoints[0]).toMatchObject({
        promptMd: "Why is Monte Carlo useful for estimation?",
        expectedAnswerMd: "It estimates integrals with random samples.",
      });
      expect(approvedUnit?.checkpoints[0].rubric).toContainEqual({
        rating: "correct",
        description: "Explains random sampling and averaging for estimation.",
      });
    } finally {
      database.close();
    }
  });

  test("fails regeneration for invalid regenerated output and leaves the existing unit unchanged", async () => {
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

      const generationBody = (await generationResponse.json()) as {
        lessonUnitIds: string[];
      };
      const firstUnitId = generationBody.lessonUnitIds[0];

      const beforeListResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const beforeList = (await beforeListResponse.json()) as {
        units: Array<{ id: string; title: string }>;
      };
      const before = beforeList.units.find((unit) => unit.id === firstUnitId);
      expect(before).toBeDefined();
      expect(before?.title).toContain("Sampling intuition");

      const regenApp = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new InvalidRegenerationGenerator(),
      });

      const response = await regenApp.request(
        `/api/lesson-units/${firstUnitId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "mock",
            reviewerNotes: "Preserve original unit because output is invalid.",
          }),
        },
      );

      expect(response.status).toBe(400);
      const regenBody = (await response.json()) as {
        generationRunId: string;
        error: string;
      };

      expect(regenBody.error).toBe("generation_validation_failed");
      const generationRun = await generationRuns.findGenerationRunById(
        regenBody.generationRunId,
      );

      expect(generationRun).toMatchObject({
        status: "failed",
        errorMessage: expect.stringContaining("Expected at least one lesson unit"),
      });

      const afterListResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const afterList = (await afterListResponse.json()) as {
        units: Array<{ id: string; title: string }>;
      };
      const after = afterList.units.find((unit) => unit.id === firstUnitId);

      expect(after?.title).toBe(before?.title);
    } finally {
      database.close();
    }
  });

  test("fails regeneration for invalid regenerated anchors and keeps unit unchanged", async () => {
    const { database, chapterSources, generationRuns } = createRepositories();
    const source = await createSourceId(chapterSources);

    try {
      const generationApp = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new TwoUnitLessonGenerator(),
      });

      const generationResponse = await generationApp.request("/api/generation-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile:
            "CS undergraduate with applied ML background; prefer formal definitions.",
        }),
      });

      const generationBody = (await generationResponse.json()) as {
        lessonUnitIds: string[];
      };
      const firstUnitId = generationBody.lessonUnitIds[0];

      const beforeListResponse = await generationApp.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const beforeList = (await beforeListResponse.json()) as {
        units: Array<{ id: string; sourceAnchors: unknown[] }>;
      };
      const before = beforeList.units.find((unit) => unit.id === firstUnitId);
      expect(before).toBeDefined();

      const regenApp = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new ForeignAnchorRegenerationGenerator(),
      });

      const response = await regenApp.request(
        `/api/lesson-units/${firstUnitId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "mock",
            reviewerNotes: "Force source URL check.",
          }),
        },
      );

      expect(response.status).toBe(400);
      const regenBody = (await response.json()) as {
        error: string;
        generationRunId: string;
      };
      expect(regenBody.error).toBe("generation_validation_failed");

      const generationRun = await generationRuns.findGenerationRunById(
        regenBody.generationRunId,
      );
      expect(generationRun).toMatchObject({
        status: "failed",
        errorMessage: expect.stringContaining("sourceUrl"),
      });

      const afterListResponse = await generationApp.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const afterList = (await afterListResponse.json()) as {
        units: Array<{ id: string; sourceAnchors: unknown[] }>;
      };
      const after = afterList.units.find((unit) => unit.id === firstUnitId);
      expect(after).toBeDefined();

      expect(after!.sourceAnchors).toEqual(before!.sourceAnchors);
    } finally {
      database.close();
    }
  });

  test("fails regeneration for out-of-range regenerated anchors and keeps unit unchanged", async () => {
    const { database, chapterSources, generationRuns } = createRepositories();
    const source = await createSourceId(chapterSources);

    try {
      const generationApp = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new TwoUnitLessonGenerator(),
      });

      const generationResponse = await generationApp.request("/api/generation-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile:
            "CS undergraduate with applied ML background; prefer formal definitions.",
        }),
      });

      const generationBody = (await generationResponse.json()) as {
        lessonUnitIds: string[];
      };
      const firstUnitId = generationBody.lessonUnitIds[0];

      const beforeListResponse = await generationApp.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const beforeList = (await beforeListResponse.json()) as {
        units: Array<{ id: string; title: string }>;
      };
      const before = beforeList.units.find((unit) => unit.id === firstUnitId);
      expect(before).toBeDefined();

      const regenApp = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new OutOfRangeAnchorRegenerationGenerator(),
      });

      const response = await regenApp.request(
        `/api/lesson-units/${firstUnitId}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "mock",
            reviewerNotes: "Force paragraph validation.",
          }),
        },
      );

      expect(response.status).toBe(400);
      const regenBody = (await response.json()) as {
        error: string;
        generationRunId: string;
      };
      expect(regenBody.error).toBe("generation_validation_failed");

      const generationRun = await generationRuns.findGenerationRunById(
        regenBody.generationRunId,
      );
      expect(generationRun).toMatchObject({
        status: "failed",
        errorMessage: expect.stringContaining("paragraph"),
      });

      const afterListResponse = await generationApp.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const afterList = (await afterListResponse.json()) as {
        units: Array<{ id: string; title: string }>;
      };
      const after = afterList.units.find((unit) => unit.id === firstUnitId);
      expect(after).toBeDefined();

      expect(after!.title).toBe(before!.title);
    } finally {
      database.close();
    }
  });
});
