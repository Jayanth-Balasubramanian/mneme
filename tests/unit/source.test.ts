import { describe, expect, test } from "bun:test";

import {
  assertUsableSourceAnchors,
  createMarkdownContentHash,
  deriveSourceAnchors,
  prepareChapterSourceImport,
  SourceImportError,
} from "../../src/domain/source";
import { parseCreateChapterSourceRequest } from "../../src/shared/source";

const sourceMetadata = {
  bookTitle: "Deep Learning",
  authors: ["Ian Goodfellow", "Yoshua Bengio", "Aaron Courville"],
  publisher: "MIT Press",
  year: 2016,
  chapterTitle: "Monte Carlo Methods",
  chapterNumber: "17",
  sourceUrl: "https://www.deeplearningbook.org/contents/monte_carlo.html",
  citationText:
    "Ian Goodfellow, Yoshua Bengio, and Aaron Courville, Deep Learning, MIT Press, 2016. http://www.deeplearningbook.org",
};

describe("chapter source validation", () => {
  test("requires source metadata and markdown", () => {
    const result = parseCreateChapterSourceRequest({
      bookTitle: "",
      authors: [],
      chapterTitle: "",
      sourceUrl: "not-a-url",
      citationText: "",
      markdown: "",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.issues.map((issue) => issue.field)).toContain("bookTitle");
      expect(result.issues.map((issue) => issue.field)).toContain("authors");
      expect(result.issues.map((issue) => issue.field)).toContain("sourceUrl");
      expect(result.issues.map((issue) => issue.field)).toContain(
        "citationText",
      );
      expect(result.issues.map((issue) => issue.field)).toContain("markdown");
    }
  });

  test("accepts the Deep Learning Chapter 17 source metadata", () => {
    const result = parseCreateChapterSourceRequest({
      ...sourceMetadata,
      markdown: "# Sample\n\nA synthetic paragraph for tests.",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        ...sourceMetadata,
        markdown: "# Sample\n\nA synthetic paragraph for tests.",
      },
    });
  });
});

describe("source anchors and hashes", () => {
  test("derives paragraph anchors from Markdown heading context", () => {
    const anchors = deriveSourceAnchors(
      "# Sampling\n\nA first synthetic paragraph.\n\n## Estimators\n\nA second synthetic paragraph.",
      sourceMetadata.sourceUrl,
    );

    expect(anchors).toEqual([
      {
        headingPath: ["Sampling"],
        paragraphStart: 1,
        paragraphEnd: 1,
        sourceUrl: sourceMetadata.sourceUrl,
      },
      {
        headingPath: ["Sampling", "Estimators"],
        paragraphStart: 2,
        paragraphEnd: 2,
        sourceUrl: sourceMetadata.sourceUrl,
      },
    ]);
  });

  test("rejects Markdown that cannot produce source anchors", () => {
    expect(() => assertUsableSourceAnchors([])).toThrow(SourceImportError);
  });

  test("creates a stable SHA-256 content hash", async () => {
    const markdown = "# Synthetic\n\nA short paragraph.";

    await expect(createMarkdownContentHash(markdown)).resolves.toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
    await expect(createMarkdownContentHash(markdown)).resolves.toBe(
      await createMarkdownContentHash(markdown),
    );
  });

  test("prepares an import with trimmed Markdown, anchors, hash, and credit", async () => {
    const prepared = await prepareChapterSourceImport({
      ...sourceMetadata,
      markdown: "\n# Sampling\n\nA synthetic paragraph for a local test.\n",
    });

    expect(prepared.markdown).toBe(
      "# Sampling\n\nA synthetic paragraph for a local test.",
    );
    expect(prepared.anchors).toHaveLength(1);
    expect(prepared.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(prepared.sourceCredit).toEqual({
      title: "Deep Learning",
      authors: sourceMetadata.authors,
      publisher: "MIT Press",
      year: 2016,
      chapterTitle: "Monte Carlo Methods",
      chapterNumber: "17",
      sourceUrl: sourceMetadata.sourceUrl,
      citationText: sourceMetadata.citationText,
    });
  });
});
