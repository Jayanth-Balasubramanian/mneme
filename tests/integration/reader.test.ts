import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { createServerApp } from "../../src/server/app";
import { SQLiteReaderRepository } from "../../src/server/db/reader";
import { migrateDatabase } from "../../src/server/db/migrations";

const pdfBytes = new TextEncoder().encode("%PDF-1.7\nsynthetic fixture only\n");

function createReaderApp() {
  const database = new Database(":memory:");
  migrateDatabase(database);
  const repository = new SQLiteReaderRepository(database);
  const app = createServerApp({
    readerRepository: repository,
    readerPdfValidator: async () => ({ pageCount: 2 }),
  });
  return { app, database };
}

function importForm(): FormData {
  const form = new FormData();
  form.set("file", new File([pdfBytes], "synthetic-fixture.pdf", { type: "application/pdf" }));
  form.set("metadata", JSON.stringify({
    originalFilename: "synthetic-fixture.pdf",
    title: "Synthetic Fixture",
    author: "Mneme Tests",
    pageCount: 2,
    pages: [{ pageNumber: 1, text: "A first synthetic page." }, { pageNumber: 2, text: "A later synthetic page." }],
    outline: [{ title: "Start", pageNumber: 1, children: [{ title: "Later", pageNumber: 2, children: [] }] }],
  }));
  return form;
}

describe("reader persistence API", () => {
  test("imports bytes, metadata, page text and state through the local API", async () => {
    const { app, database } = createReaderApp();
    try {
      const response = await app.request("/api/reader/books/import", { method: "POST", body: importForm() });
      expect(response.status).toBe(201);
      const book = await response.json() as { id: string; state: { revision: number }; outline: unknown[] };
      expect(book.outline).toHaveLength(1);
      expect(book.state.revision).toBe(0);

      const pageResponse = await app.request(`/api/reader/books/${book.id}/pages/2`);
      expect(await pageResponse.json()).toMatchObject({ pageNumber: 2, text: "A later synthetic page." });
      const pdfResponse = await app.request(`/api/reader/books/${book.id}/pdf`);
      expect(new Uint8Array(await pdfResponse.arrayBuffer())).toEqual(pdfBytes);

      const stateResponse = await app.request(`/api/reader/books/${book.id}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPage: 2, spoilerBoundaryPage: 1, stoppingNote: "Return to the definition.", revision: 0 }),
      });
      expect(stateResponse.status).toBe(200);
      const state = await stateResponse.json() as { currentPage: number; revision: number; spoilerBoundaryPage: number };
      expect(state).toMatchObject({ currentPage: 2, spoilerBoundaryPage: 1, revision: 1 });

      const staleResponse = await app.request(`/api/reader/books/${book.id}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPage: 1, revision: 0 }),
      });
      expect(staleResponse.status).toBe(409);
    } finally {
      database.close();
    }
  });

  test("rejects malformed headers and foreign mutation origins", async () => {
    const { app, database } = createReaderApp();
    try {
      const malformed = new FormData();
      malformed.set("file", new File([new TextEncoder().encode("plain text")], "not.pdf"));
      malformed.set("metadata", JSON.stringify({ originalFilename: "not.pdf", title: "No", pageCount: 2, pages: [{ pageNumber: 1, text: "a" }, { pageNumber: 2, text: "b" }] }));
      const malformedResponse = await app.request("/api/reader/books/import", { method: "POST", body: malformed });
      expect(malformedResponse.status).toBe(400);

      const foreignResponse = await app.request("/api/reader/books/import", { method: "POST", headers: { Origin: "https://evil.example" }, body: importForm() });
      expect(foreignResponse.status).toBe(403);
      const rebindingResponse = await app.request("/api/reader/books", { headers: { Host: "evil.example" } });
      expect(rebindingResponse.status).toBe(403);
    } finally {
      database.close();
    }
  });
});
