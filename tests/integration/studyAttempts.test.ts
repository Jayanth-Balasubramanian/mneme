import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { prepareChapterSourceImport } from "../../src/domain/source";
import type { LessonGenerator } from "../../src/domain/generation";
import { createServerApp } from "../../src/server/app";
import { SQLiteChapterSourceRepository } from "../../src/server/db/chapterSources";
import { SQLiteGenerationPersistence } from "../../src/server/db/generation";
import { SQLiteStudyAttemptRepository } from "../../src/server/db/studyAttempts";
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
  emphasisNotes: "Focus on weak concept telemetry for PoC.",
  markdown:
    "# Sampling\n\nA short synthetic paragraph about sampling.\n\n## Variance\n\nA second synthetic paragraph about variance reduction.",
};

type TestRepos = {
  database: Database;
  chapterSources: SQLiteChapterSourceRepository;
  generationPersistence: SQLiteGenerationPersistence;
  studyAttemptPersistence: SQLiteStudyAttemptRepository;
};

function createRepos(): TestRepos {
  const database = new Database(":memory:");
  migrateDatabase(database);

  return {
    database,
    chapterSources: new SQLiteChapterSourceRepository(database),
    generationPersistence: new SQLiteGenerationPersistence(database),
    studyAttemptPersistence: new SQLiteStudyAttemptRepository(database),
  };
}

function createSourceId(
  chapterSources: SQLiteChapterSourceRepository,
) {
  return prepareChapterSourceImport(requestBody).then((prepared) =>
    chapterSources.create(prepared),
  );
}

class SingleUnitGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    return {
      title: "Single unit telemetry draft",
      summary: "Used for telemetry integration coverage.",
      units: [
        {
          title: "Sampling intuition",
          learningObjective: "Explain sampling intuition.",
          conceptKeys: ["sampling-intuition", "mc-estimation"],
          sourceAnchors: [
            {
              headingPath: ["Sampling"],
              paragraphStart: 1,
              paragraphEnd: 1,
              sourceUrl: requestBody.sourceUrl,
            },
          ],
          explanationMd: "Explain why random sampling can approximate expectation.",
          intuitionMd: "Use the law of large numbers intuition.",
          checkpoints: [
            {
              promptMd: "What is Monte Carlo sampling used for?",
              expectedAnswerMd:
                "Approximate expectations or integrals by averaging random draws.",
              rubric: [
                {
                  rating: "wrong",
                  description: "No sampling intuition is mentioned.",
                },
                {
                  rating: "partial",
                  description: "Mentions sampling but misses averaging.",
                },
                {
                  rating: "correct",
                  description: "Correctly explains random samples to estimate quantities.",
                },
              ],
            },
            {
              promptMd: "Why does Monte Carlo converge?",
              expectedAnswerMd:
                "Averages converge with more samples under law of large numbers.",
              rubric: [
                {
                  rating: "wrong",
                  description: "Misses convergence intuition.",
                },
                {
                  rating: "partial",
                  description: "Mentions many samples only.",
                },
                {
                  rating: "correct",
                  description: "Links law of large numbers to average convergence.",
                },
              ],
            },
          ],
        },
      ],
    };
  }
}

function createStudyApp(repositories: TestRepos) {
  return createServerApp({
    chapterSourceRepository: repositories.chapterSources,
    generationRepository: repositories.generationPersistence,
    studyAttemptRepository: repositories.studyAttemptPersistence,
    lessonGenerator: new SingleUnitGenerator(),
  });
}

async function approveLessonUnit(app: ReturnType<typeof createStudyApp>, unitId: string) {
  const response = await app.request(`/api/lesson-units/${unitId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewStatus: "approved" }),
  });

  expect(response.status).toBe(200);
}

describe("study attempts and telemetry", () => {
  test("stores checkpoint attempts with lesson-context snapshot fields", async () => {
    const { database, chapterSources, generationPersistence, studyAttemptPersistence } =
      createRepos();
    const source = await createSourceId(chapterSources);

    try {
      const app = createStudyApp({
        database,
        chapterSources,
        generationPersistence,
        studyAttemptPersistence,
      });

      const runResponse = await app.request("/api/generation-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile: "CS undergrad with applied ML background.",
        }),
      });
      expect(runResponse.status).toBe(201);
      const runBody = (await runResponse.json()) as {
        lessonUnitIds: string[];
      };
      const unitId = runBody.lessonUnitIds[0];

      const unitsResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const unitsBody = (await unitsResponse.json()) as {
        units: Array<{ id: string; checkpoints: Array<{ id: string }> }>;
      };
      const targetUnit = unitsBody.units.find((unit) => unit.id === unitId);
      expect(targetUnit).toBeDefined();
      const checkpointId = targetUnit!.checkpoints[0]?.id;
      expect(checkpointId).toBeDefined();
      await approveLessonUnit(app, unitId);

      const attemptResponse = await app.request("/api/study-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkpointId,
          answerMd:
            "Approximate by averaging random samples from the target distribution.",
          selfRating: "correct",
          confidence: "high",
        }),
      });
      expect(attemptResponse.status).toBe(201);
      const attemptBody = (await attemptResponse.json()) as {
        conceptKeys: string[];
        lessonUnitId: string;
        sourceAnchors: unknown[];
      };

      expect(attemptBody.lessonUnitId).toBe(unitId);
      expect(attemptBody.conceptKeys).toEqual([
        "sampling-intuition",
        "mc-estimation",
      ]);
      expect(attemptBody.sourceAnchors).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  test("derives weak concepts from wrong and partial attempts", async () => {
    const { database, chapterSources, generationPersistence, studyAttemptPersistence } =
      createRepos();
    const source = await createSourceId(chapterSources);

    try {
      const app = createStudyApp({
        database,
        chapterSources,
        generationPersistence,
        studyAttemptPersistence,
      });

      const generationResponse = await app.request("/api/generation-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile: "CS undergrad with applied ML background.",
        }),
      });
      const generationBody = (await generationResponse.json()) as {
        lessonUnitIds: string[];
      };
      const unitId = generationBody.lessonUnitIds[0];

      const unitsResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const unitsBody = (await unitsResponse.json()) as {
        units: Array<{ id: string; checkpoints: Array<{ id: string }> }>;
      };
      const targetUnit = unitsBody.units.find((unit) => unit.id === unitId);
      expect(targetUnit).toBeDefined();
      const firstCheckpointId = targetUnit!.checkpoints[0]?.id;
      const secondCheckpointId = targetUnit!.checkpoints[1]?.id;
      expect(firstCheckpointId).toBeDefined();
      expect(secondCheckpointId).toBeDefined();
      await approveLessonUnit(app, unitId);

      const wrongAttempt = await app.request("/api/study-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkpointId: firstCheckpointId,
          answerMd: "No clear answer.",
          selfRating: "wrong",
          confidence: "low",
        }),
      });
      expect(wrongAttempt.status).toBe(201);

      const partialAttempt = await app.request("/api/study-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkpointId: secondCheckpointId,
          answerMd: "Some idea of averaging.",
          selfRating: "partial",
          confidence: "medium",
        }),
      });
      expect(partialAttempt.status).toBe(201);

      const conceptResponse = await app.request(
        `/api/weak-concepts?chapterSourceId=${source.id}`,
      );
      const conceptBody = (await conceptResponse.json()) as {
        concepts: Array<{
          conceptKey: string;
          attempts: number;
          latestAttemptAt: string;
          lessonUnitIds: string[];
        }>;
      };

      expect(conceptResponse.status).toBe(200);
      expect(conceptBody.concepts).toHaveLength(2);

      const sampling = conceptBody.concepts.find(
        (concept) => concept.conceptKey === "sampling-intuition",
      );
      const mc = conceptBody.concepts.find(
        (concept) => concept.conceptKey === "mc-estimation",
      );

      expect(sampling?.attempts).toBe(2);
      expect(mc?.attempts).toBe(2);
      expect(sampling?.lessonUnitIds).toEqual([unitId]);
      expect(mc?.lessonUnitIds).toEqual([unitId]);
      expect(sampling?.latestAttemptAt).toBeTruthy();
      expect(mc?.latestAttemptAt).toBeTruthy();
    } finally {
      database.close();
    }
  });

  test("returns invalid_json when study attempt payload is malformed", async () => {
    const { database, chapterSources, generationPersistence, studyAttemptPersistence } =
      createRepos();

    try {
      const app = createStudyApp({
        database,
        chapterSources,
        generationPersistence,
        studyAttemptPersistence,
      });

      const response = await app.request("/api/study-attempts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{",
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBe("invalid_json");
    } finally {
      database.close();
    }
  });

  test("returns validation_failed when study attempt payload is missing required fields", async () => {
    const { database, chapterSources, generationPersistence, studyAttemptPersistence } =
      createRepos();

    try {
      const app = createStudyApp({
        database,
        chapterSources,
        generationPersistence,
        studyAttemptPersistence,
      });

      const response = await app.request("/api/study-attempts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          checkpointId: "",
          answerMd: "",
          selfRating: "bad-rating",
          confidence: "very-high",
        }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBe("validation_failed");
    } finally {
      database.close();
    }
  });

  test("returns checkpoint_not_found for missing checkpoint ids", async () => {
    const { database, chapterSources, generationPersistence, studyAttemptPersistence } =
      createRepos();

    try {
      const app = createStudyApp({
        database,
        chapterSources,
        generationPersistence,
        studyAttemptPersistence,
      });

      const response = await app.request("/api/study-attempts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          checkpointId: "missing-checkpoint",
          answerMd: "I should get a 404 for missing checkpoint.",
          selfRating: "wrong",
          confidence: "low",
        }),
      });

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBe("checkpoint_not_found");
    } finally {
      database.close();
    }
  });

  test("does not record attempts against draft checkpoints", async () => {
    const { database, chapterSources, generationPersistence, studyAttemptPersistence } =
      createRepos();
    const source = await createSourceId(chapterSources);

    try {
      const app = createStudyApp({
        database,
        chapterSources,
        generationPersistence,
        studyAttemptPersistence,
      });

      const generationResponse = await app.request("/api/generation-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile: "CS undergrad with applied ML background.",
        }),
      });
      const generationBody = (await generationResponse.json()) as {
        lessonUnitIds: string[];
      };

      const unitsResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const unitsBody = (await unitsResponse.json()) as {
        units: Array<{ id: string; checkpoints: Array<{ id: string }> }>;
      };
      const targetUnit = unitsBody.units.find(
        (unit) => unit.id === generationBody.lessonUnitIds[0],
      );
      const checkpointId = targetUnit?.checkpoints[0]?.id;
      expect(checkpointId).toBeDefined();

      const response = await app.request("/api/study-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkpointId,
          answerMd: "A draft unit should not be studyable.",
          selfRating: "wrong",
          confidence: "low",
        }),
      });

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBe("checkpoint_not_found");
    } finally {
      database.close();
    }
  });

  test("returns validation_failed when weak-concept source is omitted", async () => {
    const { database, chapterSources, generationPersistence, studyAttemptPersistence } =
      createRepos();

    try {
      const app = createStudyApp({
        database,
        chapterSources,
        generationPersistence,
        studyAttemptPersistence,
      });

      const response = await app.request("/api/weak-concepts");

      expect(response.status).toBe(400);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBe("validation_failed");
    } finally {
      database.close();
    }
  });

  test("returns chapter_source_not_found when weak-concept source is unknown", async () => {
    const { database, chapterSources, generationPersistence, studyAttemptPersistence } =
      createRepos();

    try {
      const app = createStudyApp({
        database,
        chapterSources,
        generationPersistence,
        studyAttemptPersistence,
      });

      const response = await app.request(
        "/api/weak-concepts?chapterSourceId=missing-source-id",
      );

      expect(response.status).toBe(404);
      const body = (await response.json()) as { error?: string };
      expect(body.error).toBe("chapter_source_not_found");
    } finally {
      database.close();
    }
  });
});
