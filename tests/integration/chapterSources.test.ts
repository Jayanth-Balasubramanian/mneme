import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { prepareChapterSourceImport } from "../../src/domain/source";
import { createServerApp } from "../../src/server/app";
import { SQLiteChapterSourceRepository } from "../../src/server/db/chapterSources";
import { migrateDatabase } from "../../src/server/db/migrations";

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
  markdown:
    "# Synthetic Monte Carlo Notes\n\nA short synthetic paragraph about estimating an expected value.\n\n## Practice focus\n\nA second synthetic paragraph for source anchoring.",
};

function createRepository(): {
  database: Database;
  repository: SQLiteChapterSourceRepository;
} {
  const database = new Database(":memory:");
  migrateDatabase(database);

  return {
    database,
    repository: new SQLiteChapterSourceRepository(database),
  };
}

describe("chapter source import persistence", () => {
  test("stores metadata, content hash, and anchors in SQLite", async () => {
    const { database, repository } = createRepository();

    try {
      const prepared = await prepareChapterSourceImport(requestBody);
      const saved = await repository.create(prepared);
      const reread = await repository.findById(saved.id);

      expect(reread).toMatchObject({
        bookTitle: "Deep Learning",
        authors: ["Ian Goodfellow", "Yoshua Bengio", "Aaron Courville"],
        publisher: "MIT Press",
        year: 2016,
        chapterTitle: "Monte Carlo Methods",
        chapterNumber: "17",
        sourceUrl: requestBody.sourceUrl,
        citationText: requestBody.citationText,
        sourceCredit: {
          title: "Deep Learning",
          authors: ["Ian Goodfellow", "Yoshua Bengio", "Aaron Courville"],
          publisher: "MIT Press",
          year: 2016,
          chapterTitle: "Monte Carlo Methods",
          chapterNumber: "17",
          sourceUrl: requestBody.sourceUrl,
          citationText: requestBody.citationText,
        },
      });
      expect(reread?.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(reread?.anchors).toHaveLength(2);
    } finally {
      database.close();
    }
  });

  test("imports a Markdown excerpt through POST /api/chapter-sources", async () => {
    const { database, repository } = createRepository();
    const app = createServerApp({ chapterSourceRepository: repository });

    try {
      const response = await app.request("/api/chapter-sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      expect(response.status).toBe(201);

      const body = await response.json();

      expect(body).toMatchObject({
        bookTitle: "Deep Learning",
        chapterTitle: "Monte Carlo Methods",
        sourceUrl: requestBody.sourceUrl,
        sourceCredit: {
          title: "Deep Learning",
          year: 2016,
        },
      });
      expect(body.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(body.anchors).toHaveLength(2);
    } finally {
      database.close();
    }
  });

  test("rejects empty Markdown through the API", async () => {
    const { database, repository } = createRepository();
    const app = createServerApp({ chapterSourceRepository: repository });

    try {
      const response = await app.request("/api/chapter-sources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...requestBody, markdown: "  " }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "validation_failed",
      });
    } finally {
      database.close();
    }
  });
});
