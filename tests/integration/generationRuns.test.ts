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

function createMockChapterSourceId(
  chapterSources: SQLiteChapterSourceRepository,
) {
  return prepareChapterSourceImport(requestBody).then((prepared) =>
    chapterSources.create(prepared),
  );
}

class InvalidLessonGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    return {
      title: "Invalid mock draft",
      summary: "Generator returns no units.",
      units: [],
    };
  }
}

class ValidLessonGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    return {
      title: "Injected mock lesson",
      summary: "Used for deterministic integration testing.",
      units: [
        {
          title: "Mock unit",
          learningObjective: "Test a mock concept.",
          conceptKeys: ["test-concept"],
          sourceAnchors: [
            {
              headingPath: ["Synthetic Monte Carlo Notes"],
              paragraphStart: 1,
              paragraphEnd: 1,
              sourceUrl: requestBody.sourceUrl,
            },
          ],
          explanationMd: "Explain a synthetic concept.",
          intuitionMd: "Use intuition language for a synthetic concept.",
          checkpoints: [
            {
              promptMd: "What is this concept?",
              expectedAnswerMd:
                "It is a concept from the synthetic mock source.",
              rubric: [
                {
                  rating: "wrong",
                  description: "The response is incomplete.",
                },
                {
                  rating: "partial",
                  description: "The response is partially correct.",
                },
                {
                  rating: "correct",
                  description: "The response is fully correct.",
                },
              ],
            },
          ],
        },
      ],
    };
  }
}

class ForeignSourceUrlGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    return {
      title: "Injected foreign source draft",
      summary: "Uses a sourceUrl outside the chapter context.",
      units: [
        {
          title: "Mock unit",
          learningObjective: "Test source-url provenance.",
          conceptKeys: ["test-concept"],
          sourceAnchors: [
            {
              headingPath: ["Synthetic Monte Carlo Notes"],
              paragraphStart: 1,
              paragraphEnd: 1,
              sourceUrl: "https://malicious.example.com/chapter",
            },
          ],
          explanationMd: "Explain a synthetic concept from an unexpected source.",
          intuitionMd: "Use intuition language for a synthetic concept.",
          checkpoints: [
            {
              promptMd: "What is this concept?",
              expectedAnswerMd:
                "It is a concept from an external source.",
              rubric: [
                {
                  rating: "wrong",
                  description: "The response is incomplete.",
                },
                {
                  rating: "partial",
                  description: "The response is partially complete.",
                },
                {
                  rating: "correct",
                  description: "The response is fully complete.",
                },
              ],
            },
          ],
        },
      ],
    };
  }
}

class OutOfRangeAnchorGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    return {
      title: "Injected impossible range draft",
      summary: "Uses an impossible paragraph range.",
      units: [
        {
          title: "Mock unit",
          learningObjective: "Test paragraph provenance.",
          conceptKeys: ["test-concept"],
          sourceAnchors: [
            {
              headingPath: ["Synthetic Monte Carlo Notes"],
              paragraphStart: 99,
              paragraphEnd: 101,
              sourceUrl: requestBody.sourceUrl,
            },
          ],
          explanationMd: "Explain a synthetic concept from an impossible range.",
          intuitionMd: "Use intuition language for a synthetic concept.",
          checkpoints: [
            {
              promptMd: "What is this concept?",
              expectedAnswerMd:
                "It is a concept from an impossible paragraph range.",
              rubric: [
                {
                  rating: "wrong",
                  description: "The response is incomplete.",
                },
                {
                  rating: "partial",
                  description: "The response is partially complete.",
                },
                {
                  rating: "correct",
                  description: "The response is fully complete.",
                },
              ],
            },
          ],
        },
      ],
    };
  }
}

class ThrowingLessonGenerator implements LessonGenerator {
  async generate(): Promise<LessonGenerationDraft> {
    throw new Error("API key: sk_test_ABC123 should never be exposed");
  }
}

describe("generation run workflow", () => {
  test("imports then mocks generation into persisted draft lesson units", async () => {
    const { database, chapterSources, generationRuns } = createRepositories();
    const source = await createMockChapterSourceId(chapterSources);

    try {
      const app = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new ValidLessonGenerator(),
      });

      const response = await app.request("/api/generation-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile: "CS undergraduate with applied ML background.",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();

      expect(body).toEqual(
        expect.objectContaining({
          chapterSourceId: source.id,
          provider: "mock",
          status: "succeeded",
          lessonUnitIds: [expect.any(String)],
        }),
      );
      expect(body.lessonUnitIds.length).toBe(1);

      const listResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const listBody = await listResponse.json();

      expect(listResponse.status).toBe(200);
      expect(listBody.units).toHaveLength(1);
      expect(listBody.units[0]).toMatchObject({
        id: body.lessonUnitIds[0],
        chapterSourceId: source.id,
        title: "Mock unit",
        reviewStatus: "draft",
        sourceCredit: {
          title: "Deep Learning",
        },
      });
      expect(listBody.units[0].checkpoints).toHaveLength(1);
      expect(listBody.units[0].checkpoints[0]).toMatchObject({
        promptMd: "What is this concept?",
      });
      expect(listBody.units[0].sourceAnchors).toEqual([
        {
          headingPath: ["Synthetic Monte Carlo Notes"],
          paragraphStart: 1,
          paragraphEnd: 1,
          sourceUrl: requestBody.sourceUrl,
        },
      ]);
      expect(listBody.units[0].sourceContext).toEqual([
        expect.objectContaining({
          paragraphIndex: 1,
          headingPath: ["Synthetic Monte Carlo Notes"],
          text: "A short synthetic paragraph about estimating an expected value.",
        }),
        expect.objectContaining({
          paragraphIndex: 2,
          headingPath: ["Synthetic Monte Carlo Notes", "Practice focus"],
          text: "A second synthetic paragraph for source anchoring.",
        }),
      ]);

      const generationRun = await generationRuns.findGenerationRunById(body.id);
      expect(generationRun).toMatchObject({ status: "succeeded" });
    } finally {
      database.close();
    }
  });

  test("marks the generation run as failed and does not persist units on invalid output", async () => {
    const { database, chapterSources, generationRuns } = createRepositories();
    const source = await createMockChapterSourceId(chapterSources);

    try {
      const app = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new InvalidLessonGenerator(),
      });

      const response = await app.request("/api/generation-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile: "CS undergraduate with applied ML background.",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();

      expect(body).toEqual(
        expect.objectContaining({
          chapterSourceId: source.id,
          status: "failed",
          lessonUnitIds: [],
        }),
      );
      expect(body.errorMessage).toContain("units");

      const listResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const listBody = await listResponse.json();

      expect(listResponse.status).toBe(200);
      expect(listBody).toEqual({ units: [] });

      const generationRun = await generationRuns.findGenerationRunById(body.id);
      expect(generationRun).toMatchObject({
        status: "failed",
        chapterSourceId: source.id,
      });
      expect(generationRun?.rawOutputJson).toContain('"units":[]');
    } finally {
      database.close();
    }
  });

  test("rejects unsupported provider requests that are not implemented", async () => {
    const { database, chapterSources } = createRepositories();

    try {
      const source = await createMockChapterSourceId(chapterSources);
      const app = createServerApp({
        chapterSourceRepository: chapterSources,
      });

      const response = await app.request("/api/generation-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "openai",
          learnerProfile: "CS undergraduate with applied ML background.",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();

      expect(body).toMatchObject({
        error: "provider_not_supported",
      });
    } finally {
      database.close();
    }
  });

  test("rejects foreign source anchors and does not persist generated units", async () => {
    const { database, chapterSources, generationRuns } = createRepositories();
    const source = await createMockChapterSourceId(chapterSources);

    try {
      const app = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new ForeignSourceUrlGenerator(),
      });

      const response = await app.request("/api/generation-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile: "CS undergraduate with applied ML background.",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();

      expect(body).toEqual(
        expect.objectContaining({
          chapterSourceId: source.id,
          status: "failed",
          lessonUnitIds: [],
        }),
      );

      const listResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const listBody = await listResponse.json();

      expect(listResponse.status).toBe(200);
      expect(listBody).toEqual({ units: [] });

      const generationRun = await generationRuns.findGenerationRunById(body.id);
      expect(generationRun).toMatchObject({ status: "failed" });
      expect(generationRun?.errorMessage).toContain("sourceUrl");
    } finally {
      database.close();
    }
  });

  test("rejects impossible paragraph ranges and does not persist generated units", async () => {
    const { database, chapterSources, generationRuns } = createRepositories();
    const source = await createMockChapterSourceId(chapterSources);

    try {
      const app = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new OutOfRangeAnchorGenerator(),
      });

      const response = await app.request("/api/generation-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile: "CS undergraduate with applied ML background.",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();

      expect(body).toEqual(
        expect.objectContaining({
          chapterSourceId: source.id,
          status: "failed",
          lessonUnitIds: [],
        }),
      );

      const listResponse = await app.request(
        `/api/lesson-units?chapterSourceId=${source.id}`,
      );
      const listBody = await listResponse.json();

      expect(listResponse.status).toBe(200);
      expect(listBody).toEqual({ units: [] });

      const generationRun = await generationRuns.findGenerationRunById(body.id);
      expect(generationRun).toMatchObject({ status: "failed" });
      expect(generationRun?.errorMessage).toContain("paragraph");
    } finally {
      database.close();
    }
  });

  test("returns generic failure details when provider throws", async () => {
    const { database, chapterSources, generationRuns } = createRepositories();
    const source = await createMockChapterSourceId(chapterSources);

    try {
      const app = createServerApp({
        chapterSourceRepository: chapterSources,
        generationRepository: generationRuns,
        lessonGenerator: new ThrowingLessonGenerator(),
      });

      const response = await app.request("/api/generation-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chapterSourceId: source.id,
          provider: "mock",
          learnerProfile: "CS undergraduate with applied ML background.",
        }),
      });

      expect(response.status).toBe(201);
      const body = await response.json();

      expect(body).toEqual(
        expect.objectContaining({
          chapterSourceId: source.id,
          status: "failed",
          lessonUnitIds: [],
          errorMessage: "generation_provider_failed",
        }),
      );

      const generationRun = await generationRuns.findGenerationRunById(body.id);
      expect(generationRun).toMatchObject({
        status: "failed",
        errorMessage: "generation_provider_failed",
      });

      expect(generationRun?.rawOutputJson).not.toContain("sk_test_ABC123");
    } finally {
      database.close();
    }
  });
});
