import { describe, expect, test } from "bun:test";

import {
  parseReaderImportMetadata,
  parseReaderStateUpdate,
  READER_MAX_PDF_PAGES,
  normalizedRectFromClientRect,
  validateReaderStateUpdate,
} from "../../src/shared/reader";

describe("reader contracts", () => {
  test("accepts ordered page text and nested physical outline entries", () => {
    const result = parseReaderImportMetadata({
      originalFilename: "synthetic.pdf",
      title: "Synthetic Reader Fixture",
      pageCount: 2,
      pages: [{ pageNumber: 1, text: "first" }, { pageNumber: 2, text: "second" }],
      outline: [{ title: "Start", pageNumber: 1, children: [{ title: "End", pageNumber: 2, children: [] }] }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.outline[0]?.children[0]?.pageNumber).toBe(2);
  });

  test("rejects page count outside the reader limit", () => {
    const result = parseReaderImportMetadata({
      originalFilename: "synthetic.pdf",
      title: "Synthetic",
      pageCount: READER_MAX_PDF_PAGES + 1,
      pages: [],
    });

    expect(result.ok).toBe(false);
  });

  test("keeps selection rectangles normalized and clamps outside coordinates", () => {
    expect(normalizedRectFromClientRect(
      { left: 50, top: 100, right: 250, bottom: 300 },
      { left: 100, top: 50, width: 400, height: 400 },
    )).toEqual({ x: 0, y: 0.125, width: 0.375, height: 0.5 });
  });

  test("validates state values against the physical page count", () => {
    const parsed = parseReaderStateUpdate({ currentPage: 4, spoilerBoundaryPage: 2, scrollTop: 1.2, zoom: 4 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(validateReaderStateUpdate(parsed.value, 3).map((issue) => issue.field)).toEqual([
        "currentPage", "scrollTop", "zoom",
      ]);
    }
  });
});
