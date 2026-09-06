import { describe, expect, test } from "bun:test";

import { buildReaderContext } from "../../src/domain/readerContext";
import type { CompanionConversation } from "../../src/shared/companion";
import type { ReaderPageText, ReaderState } from "../../src/shared/reader";

const state: ReaderState = { bookId: "book-1", currentPage: 2, scrollTop: 0, zoom: 1, spoilerBoundaryPage: 2, stoppingNote: "", revision: 0, updatedAt: "now" };
const pages: ReaderPageText[] = [1, 2, 3, 4].map((pageNumber) => ({ bookId: "book-1", pageNumber, text: `Synthetic page ${pageNumber} defines the concept.` }));

function conversation(maxContextPage: number, evidencePages: number[]): CompanionConversation {
  return { id: String(maxContextPage), bookId: "book-1", question: "What is the concept?", mode: "define", provider: "demo", answer: "Synthetic answer", citations: evidencePages.map((pageNumber) => ({ pageNumber })), evidencePages, maxContextPage, supplementary: false, insufficientContext: false, status: "answered", resolved: false, kept: false, createdAt: "now", updatedAt: "now" };
}

describe("bounded reader context", () => {
  test("clips selected page windows and excludes later pages and later-derived history", () => {
    const context = buildReaderContext({ bookId: "book-1", question: "Define concept", mode: "explain", pageNumber: 1, provider: "demo" }, state, pages, [conversation(2, [2]), conversation(3, [3])]);
    expect(context.allowedPages).toEqual([1, 2]);
    expect(context.text).toContain("Page 1");
    expect(context.text).not.toContain("Synthetic page 3");
    expect(context.history).toHaveLength(1);
  });

  test("clips an explicit orientation range at the spoiler boundary", () => {
    const context = buildReaderContext({ bookId: "book-1", question: "Orient me", mode: "orient", pageFrom: 1, pageTo: 4, provider: "demo" }, state, pages, []);
    expect(context.allowedPages).toEqual([1, 2]);
    expect(context.maxContextPage).toBe(2);
  });

  test("keeps orientation context inside its requested range even when the saved page is later", () => {
    const context = buildReaderContext({ bookId: "book-1", question: "Orient me", mode: "orient", pageFrom: 1, pageTo: 2, provider: "demo" }, { ...state, currentPage: 4, spoilerBoundaryPage: 4 }, pages, []);
    expect(context.allowedPages).toEqual([1, 2]);
    expect(context.text).not.toContain("Synthetic page 4");
  });

  test("prioritizes the selected page and emits only pages whose source was included", () => {
    const long = "eigenvector " + "x".repeat(12_500);
    const selectedPages: ReaderPageText[] = [
      { bookId: "book-1", pageNumber: 1, text: "Earlier eigenvector definition." },
      { bookId: "book-1", pageNumber: 2, text: long },
      { bookId: "book-1", pageNumber: 3, text: "Later page should not be read." },
    ];
    const context = buildReaderContext({ bookId: "book-1", question: "Define", mode: "define", pageNumber: 2, provider: "demo", selection: { text: "eigenvector", pageNumber: 2, rectangles: [] } }, { ...state, currentPage: 2 }, selectedPages, []);
    expect(context.text.indexOf("Page 2")).toBeLessThan(context.text.indexOf("Page 1"));
    expect(context.text).toContain("Earlier eigenvector definition.");
    expect(context.text).not.toContain("Later page should not be read.");
    expect(context.allowedPages).toEqual([1, 2]);
    expect(context.citationPages).toEqual([1, 2]);
    expect(context.maxContextPage).toBe(2);
  });

  test("carries transitive history taint into maxContextPage without turning history into citations", () => {
    const history = [conversation(2, [1]), conversation(3, [2])];
    const context = buildReaderContext({ bookId: "book-1", question: "Explain concept", mode: "explain", pageNumber: 1, provider: "demo" }, { ...state, spoilerBoundaryPage: 3 }, [pages[0]!], history);
    expect(context.history).toHaveLength(2);
    expect(context.citationPages).toEqual([1]);
    expect(context.maxContextPage).toBe(3);

    const lowered = buildReaderContext({ bookId: "book-1", question: "Explain concept", mode: "explain", pageNumber: 1, provider: "demo" }, { ...state, spoilerBoundaryPage: 2 }, [pages[0]!], history);
    expect(lowered.history).toHaveLength(1);
    expect(lowered.history[0]?.maxContextPage).toBe(2);
    expect(lowered.maxContextPage).toBe(2);
  });
});
