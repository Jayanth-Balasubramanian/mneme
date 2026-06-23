import type {
  ChapterSourceResponse,
  CreateChapterSourceRequest,
  SourceAnchor,
  SourceCredit,
} from "../shared/source";

export type PreparedChapterSource = CreateChapterSourceRequest & {
  contentHash: string;
  anchors: SourceAnchor[];
  sourceCredit: SourceCredit;
};

export class SourceImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceImportError";
  }
}

function stripMarkdownHeadingText(value: string): string {
  return value
    .replace(/\s+#+\s*$/, "")
    .replace(/[*_`[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function updateHeadingPath(
  headingPath: string[],
  level: number,
  heading: string,
): string[] {
  const nextPath = headingPath.slice(0, Math.max(0, level - 1));
  nextPath[level - 1] = heading;
  return nextPath;
}

export function deriveSourceAnchors(
  markdown: string,
  sourceUrl: string,
): SourceAnchor[] {
  const anchors: SourceAnchor[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let headingPath: string[] = [];
  let paragraphBuffer: string[] = [];
  let paragraphNumber = 0;
  let inFence = false;

  function flushParagraph(): void {
    const paragraphText = paragraphBuffer.join("\n").trim();
    paragraphBuffer = [];

    if (paragraphText.length === 0) {
      return;
    }

    paragraphNumber += 1;
    anchors.push({
      headingPath: [...headingPath],
      paragraphStart: paragraphNumber,
      paragraphEnd: paragraphNumber,
      sourceUrl,
    });
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const fenceMarker = /^(?:```|~~~)/.test(trimmed);

    if (fenceMarker) {
      paragraphBuffer.push(line);

      if (inFence) {
        flushParagraph();
      }

      inFence = !inFence;
      continue;
    }

    if (!inFence) {
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);

      if (headingMatch) {
        flushParagraph();
        headingPath = updateHeadingPath(
          headingPath,
          headingMatch[1].length,
          stripMarkdownHeadingText(headingMatch[2]),
        );
        continue;
      }

      if (trimmed.length === 0) {
        flushParagraph();
        continue;
      }
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();

  return anchors;
}

export function assertUsableSourceAnchors(anchors: SourceAnchor[]): void {
  if (anchors.length === 0) {
    throw new SourceImportError(
      "Markdown excerpt must contain at least one paragraph to anchor.",
    );
  }

  for (const anchor of anchors) {
    if (
      anchor.paragraphStart < 1 ||
      anchor.paragraphEnd < anchor.paragraphStart ||
      anchor.sourceUrl.trim().length === 0
    ) {
      throw new SourceImportError("Markdown excerpt produced an invalid anchor.");
    }
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createMarkdownContentHash(
  markdown: string,
): Promise<string> {
  const bytes = new TextEncoder().encode(markdown);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

export function toSourceCredit(
  source: Pick<
    ChapterSourceResponse,
    | "bookTitle"
    | "authors"
    | "publisher"
    | "year"
    | "chapterTitle"
    | "chapterNumber"
    | "sourceUrl"
    | "citationText"
  >,
): SourceCredit {
  return {
    title: source.bookTitle,
    authors: [...source.authors],
    publisher: source.publisher,
    year: source.year,
    chapterTitle: source.chapterTitle,
    chapterNumber: source.chapterNumber,
    sourceUrl: source.sourceUrl,
    citationText: source.citationText,
  };
}

export async function prepareChapterSourceImport(
  input: CreateChapterSourceRequest,
): Promise<PreparedChapterSource> {
  const markdown = input.markdown.trim();
  const anchors = deriveSourceAnchors(markdown, input.sourceUrl);
  assertUsableSourceAnchors(anchors);

  return {
    ...input,
    markdown,
    contentHash: await createMarkdownContentHash(markdown),
    anchors,
    sourceCredit: toSourceCredit(input),
  };
}
