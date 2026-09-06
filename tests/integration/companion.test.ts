import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { createServerApp } from "../../src/server/app";
import { SQLiteConversationRepository } from "../../src/server/db/conversations";
import { SQLiteReaderRepository } from "../../src/server/db/reader";
import { migrateDatabase } from "../../src/server/db/migrations";

function setup() {
  const database = new Database(":memory:");
  migrateDatabase(database);
  const reader = new SQLiteReaderRepository(database);
  const book = reader.create({ originalFilename: "synthetic.pdf", title: "Synthetic", pageCount: 3, pages: [{ pageNumber: 1, text: "A bounded definition." }, { pageNumber: 2, text: "A bounded example." }, { pageNumber: 3, text: "A later spoiler." }], outline: [], bytes: new TextEncoder().encode("%PDF-1.7 synthetic") }, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  const conversations = new SQLiteConversationRepository(database);
  reader.updateState(book.id, { spoilerBoundaryPage: 2, revision: 0 });
  const app = createServerApp({ readerRepository: reader, conversationRepository: conversations });
  return { app, reader, database, book };
}

describe("companion bounded question flow", () => {
  test("answers with demo, persists history, and hides evidence after lowering boundary", async () => {
    const { app, reader, database, book } = setup();
    try {
      const response = await app.request("/api/companion/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId: book.id, question: "Explain the definition", mode: "explain", pageNumber: 1, provider: "demo" }) });
      expect(response.status).toBe(201);
      const conversation = await response.json() as { id: string; status: string; evidencePages: number[] };
      expect(conversation.status).toBe("answered");
      expect(conversation.evidencePages).toEqual([1, 2]);

      const list = await app.request(`/api/companion/books/${book.id}/conversations`);
      expect((await list.json() as { conversations: unknown[] }).conversations).toHaveLength(1);
      const state = reader.getState(book.id)!;
      reader.updateState(book.id, { ...state, spoilerBoundaryPage: 1, revision: state.revision });
      const lowered = await app.request(`/api/companion/books/${book.id}/conversations`);
      expect((await lowered.json() as { conversations: unknown[] }).conversations).toHaveLength(0);

      const visible = await app.request(`/api/companion/books/${book.id}/conversations`);
      const savedConversation = (await visible.json() as { conversations: Array<{ id: string; kept: boolean }> }).conversations[0];
      expect(savedConversation).toBeUndefined();
    } finally {
      database.close();
    }
  });

  test("rejects out of-bound orientation and conflicting selection page requests", async () => {
    const { app, database, book } = setup();
    try {
      const orientation = await app.request("/api/companion/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId: book.id, question: "Orient", mode: "orient", pageFrom: 1, pageTo: 3, provider: "demo" }) });
      expect(orientation.status).toBe(400);
      expect((await orientation.json() as { error: string }).error).toBe("spoiler_boundary_violation");
      const mismatch = await app.request("/api/companion/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId: book.id, question: "Explain", mode: "explain", pageNumber: 1, provider: "demo", selection: { pageNumber: 2, text: "example", rectangles: [] } }) });
      expect(mismatch.status).toBe(400);
      expect((await mismatch.json() as { error: string }).error).toBe("selection_page_mismatch");
    } finally {
      database.close();
    }
  });

  test("persists a separate keep marker and protects resolution mutations with a body bound", async () => {
    const { app, database, book } = setup();
    try {
      const response = await app.request("/api/companion/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId: book.id, question: "Explain the definition", mode: "explain", pageNumber: 1, provider: "demo" }) });
      const conversation = await response.json() as { id: string; kept: boolean };
      expect(conversation.kept).toBe(false);
      const kept = await app.request(`/api/companion/books/${book.id}/conversations/${conversation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kept: true }) });
      expect(kept.status).toBe(200);
      expect((await kept.json() as { kept: boolean }).kept).toBe(true);
    } finally {
      database.close();
    }
  });
});
