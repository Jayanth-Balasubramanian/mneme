import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { DemoCodexChatService } from "../../src/server/ai/codex";
import { createServerApp } from "../../src/server/app";
import { SQLiteConversationRepository } from "../../src/server/db/conversations";
import { SQLiteCodexThreadRepository } from "../../src/server/db/codexThreads";
import { SQLiteReaderRepository } from "../../src/server/db/reader";
import { migrateDatabase } from "../../src/server/db/migrations";

function setup() {
  const database = new Database(":memory:");
  migrateDatabase(database);
  const reader = new SQLiteReaderRepository(database);
  const book = reader.create({
    originalFilename: "chat.pdf",
    title: "Chat fixture",
    pageCount: 2,
    pages: [{ pageNumber: 1, text: "A first page." }, { pageNumber: 2, text: "A second page." }],
    outline: [],
    bytes: new TextEncoder().encode("%PDF-1.7 fixture"),
  }, "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
  const conversations = new SQLiteConversationRepository(database);
  const threads = new SQLiteCodexThreadRepository(database);
  const app = createServerApp({ readerRepository: reader, conversationRepository: conversations, codexChatService: new DemoCodexChatService(), codexThreadRepository: threads });
  return { database, app, book, threads };
}

describe("plain companion chat", () => {
  test("persists a message, demo answer, thread id, and reloadable history", async () => {
    const { database, app, book, threads } = setup();
    try {
      const response = await app.request("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id, message: "What is this book about?" }),
      });
      expect(response.status).toBe(201);
      const saved = await response.json() as { id: string; provider: string; mode: string; answer: string; citations: Array<{ pageNumber: number }> };
      expect(saved.provider).toBe("demo");
      expect(saved.mode).toBe("explain");
      expect(saved.answer).toContain("Chat fixture");
      expect(saved.citations).toEqual([{ pageNumber: 1 }]);
      expect(threads.findByBookId(book.id)?.threadId).toBe(`demo-${book.id}`);

      const history = await app.request(`/api/companion/books/${book.id}/chat`);
      expect(history.status).toBe(200);
      expect((await history.json() as { conversations: Array<{ id: string }> }).conversations.map(({ id }) => id)).toEqual([saved.id]);
    } finally {
      database.close();
    }
  });

  test("keeps the selected page attachment scoped to the active book", async () => {
    const { database, app, book } = setup();
    try {
      const response = await app.request("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id, message: "Explain this", selection: { pageNumber: 2, text: "A second page.", rectangles: [] } }),
      });
      expect(response.status).toBe(201);
      expect((await response.json() as { selection: { pageNumber: number } }).selection.pageNumber).toBe(2);
      const invalid = await app.request("/api/companion/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.id, message: "Explain this", selection: { pageNumber: 9, text: "foreign", rectangles: [] } }),
      });
      expect(invalid.status).toBe(400);
    } finally {
      database.close();
    }
  });
});

