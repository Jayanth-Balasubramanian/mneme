import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { createReaderToolHandler } from "../../src/server/ai/codexTools";
import { SQLiteReaderRepository } from "../../src/server/db/reader";
import { migrateDatabase } from "../../src/server/db/migrations";

function setup() {
  const database = new Database(":memory:");
  migrateDatabase(database);
  const reader = new SQLiteReaderRepository(database);
  const book = reader.create({
    originalFilename: "tools.pdf",
    title: "Tool fixture",
    pageCount: 3,
    pages: [
      { pageNumber: 1, text: "A literal [x] token introduces the idea." },
      { pageNumber: 2, text: "The same [x] token appears again, with a longer explanation." },
      { pageNumber: 3, text: "A later page is kept separate." },
    ],
    outline: [],
    bytes: new TextEncoder().encode("%PDF-1.7 fixture"),
  }, "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  return { database, reader, book, tools: createReaderToolHandler(reader, book, book.state) };
}

describe("Codex reader tools", () => {
  test("searches literal text without interpreting regex characters", async () => {
    const { database, tools } = setup();
    try {
      const result = await tools("search_book", { query: "[x]" });
      expect(result.pages).toEqual([1, 2]);
      expect(result.text).toContain("literal [x]");
    } finally {
      database.close();
    }
  });

  test("rejects foreign identifiers and malformed page requests", async () => {
    const { database, tools } = setup();
    try {
      await expect(tools("search_book", { query: "idea", bookId: "another-book" })).rejects.toThrow("literal query");
      await expect(tools("read_pages", { pages: [1], bookId: "another-book" })).rejects.toThrow("only a pages array");
      await expect(tools("read_pages", { pages: [99] })).rejects.toThrow("outside this book");
    } finally {
      database.close();
    }
  });

  test("returns bounded page text and position metadata without treating position as evidence", async () => {
    const { database, tools } = setup();
    try {
      const position = await tools("get_reader_position", {});
      expect(position.pages).toEqual([]);
      expect(position.text).toContain("Tool fixture");
      const page = await tools("read_pages", { pages: [2] });
      expect(page.pages).toEqual([2]);
      expect(page.text).toContain("longer explanation");
    } finally {
      database.close();
    }
  });
});

