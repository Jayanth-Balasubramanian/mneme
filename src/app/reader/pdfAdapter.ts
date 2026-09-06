import {
  getDocument,
  GlobalWorkerOptions,
  PasswordException,
  RenderingCancelledException,
  TextLayer,
} from "pdfjs-dist";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  READER_MAX_PDF_BYTES,
  READER_MAX_PDF_PAGES,
  validatePdfHeader,
} from "../../shared/reader";
import type { ReaderOutlineItem } from "../../shared/reader";

type TextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>;

GlobalWorkerOptions.workerSrc = workerUrl;

export type ParsedPdfPage = {
  pageNumber: number;
  text: string;
};

export type ParsedLocalPdf = {
  bytes: Uint8Array;
  document: PDFDocumentProxy;
  title?: string;
  author?: string;
  pages: ParsedPdfPage[];
  outline: ReaderOutlineItem[];
};

export class PdfAdapterError extends Error {
  readonly reason: "too_large" | "invalid_header" | "malformed" | "password_protected" | "empty" | "scanned";

  constructor(reason: PdfAdapterError["reason"], message: string) {
    super(message);
    this.name = "PdfAdapterError";
    this.reason = reason;
  }
}

type RestrictedDocumentOptions = Parameters<typeof getDocument>[0] & {
  isEvalSupported: false;
};

function pdfError(error: unknown): PdfAdapterError {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof PasswordException || /password/i.test(`${name} ${message}`)) {
    return new PdfAdapterError("password_protected", "This PDF is password protected. Remove the password and try again.");
  }
  return new PdfAdapterError("malformed", `PDF.js could not open this file: ${message}`);
}

function textFromContent(content: TextContent): string {
  return content.items
    .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

async function destinationPage(
  document: PDFDocumentProxy,
  destination: unknown,
): Promise<number | undefined> {
  try {
    const resolved = typeof destination === "string" ? await document.getDestination(destination) : destination;
    if (!Array.isArray(resolved) || resolved.length === 0) return undefined;
    if (typeof resolved[0] === "number" && Number.isInteger(resolved[0])) return resolved[0] + 1;
    const pageIndex = await document.getPageIndex(resolved[0]);
    return pageIndex + 1;
  } catch {
    return undefined;
  }
}

async function mapOutline(
  document: PDFDocumentProxy,
  entries: Array<{ title: string; dest: unknown; items?: unknown[] }>,
): Promise<ReaderOutlineItem[]> {
  return Promise.all(entries.map(async (entry) => ({
    title: entry.title.trim(),
    pageNumber: await destinationPage(document, entry.dest),
    children: Array.isArray(entry.items)
      ? await mapOutline(document, entry.items as Array<{ title: string; dest: unknown; items?: unknown[] }>)
      : [],
  })));
}

export async function parseLocalPdf(file: File): Promise<ParsedLocalPdf> {
  if (file.size > READER_MAX_PDF_BYTES) {
    throw new PdfAdapterError("too_large", "PDFs must be 25 MiB or smaller.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validatePdfHeader(bytes)) {
    throw new PdfAdapterError("invalid_header", "This file does not have a valid PDF header.");
  }

  let loadingTask: ReturnType<typeof getDocument> | undefined;
  try {
    const options: RestrictedDocumentOptions = {
      data: bytes.slice(),
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
      useWorkerFetch: false,
      enableXfa: false,
      stopAtErrors: true,
    };
    loadingTask = getDocument(options);
    const document = await loadingTask.promise;
    if (document.numPages < 1) throw new PdfAdapterError("empty", "This PDF has no pages.");
    if (document.numPages > READER_MAX_PDF_PAGES) {
      await loadingTask.destroy();
      throw new PdfAdapterError("too_large", "PDFs must contain 2,000 pages or fewer.");
    }
    const pages: ParsedPdfPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const text = textFromContent(await page.getTextContent());
      pages.push({ pageNumber, text });
    }
    if (pages.every((page) => page.text.length === 0)) {
      await loadingTask.destroy();
      throw new PdfAdapterError("scanned", "This PDF contains no selectable text. Scanned PDFs are not supported yet; region capture works for broken math within text PDFs.");
    }
    let title: string | undefined;
    let author: string | undefined;
    try {
      const metadata = await document.getMetadata();
      const info = metadata.info as { Title?: unknown; Author?: unknown };
      title = typeof info.Title === "string" && info.Title.trim() ? info.Title.trim() : undefined;
      author = typeof info.Author === "string" && info.Author.trim() ? info.Author.trim() : undefined;
    } catch {
      // Metadata is optional and does not prevent reading.
    }
    const rawOutline = await document.getOutline();
    const outline = rawOutline ? await mapOutline(document, rawOutline) : [];
    return { bytes, document, title, author, pages, outline };
  } catch (error) {
    if (error instanceof PdfAdapterError) throw error;
    if (loadingTask) await loadingTask.destroy().catch(() => undefined);
    throw pdfError(error);
  }
}

export async function openPdfBytes(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const options: RestrictedDocumentOptions = {
    data: bytes.slice(),
    isEvalSupported: false,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    useWorkerFetch: false,
    enableXfa: false,
    stopAtErrors: true,
  };
  return getDocument(options).promise;
}

export function disposePdfDocument(document: PDFDocumentProxy): void {
  const closable = document as PDFDocumentProxy & { destroy?: () => Promise<void> };
  if (closable.destroy) {
    void closable.destroy().catch(() => undefined);
    return;
  }
  document.cleanup();
}

export type PageRender = {
  viewport: ReturnType<PDFPageProxy["getViewport"]>;
  renderTask: RenderTask;
  textLayer: TextLayer;
};

export async function renderPdfPage(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  textLayerContainer: HTMLElement,
  zoom: number,
  onRenderTask?: (task: RenderTask) => void,
): Promise<PageRender> {
  const viewport = page.getViewport({ scale: zoom });
  const outputScale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  textLayerContainer.replaceChildren();
  textLayerContainer.style.width = `${viewport.width}px`;
  textLayerContainer.style.height = `${viewport.height}px`;
  if (!canvas.getContext("2d")) throw new Error("Canvas rendering is unavailable in this browser.");
  const renderTask = page.render({ canvas, viewport, transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined });
  onRenderTask?.(renderTask);
  const textContent = await page.getTextContent();
  const textLayer = new TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
  await Promise.all([renderTask.promise, textLayer.render()]);
  return { viewport, renderTask, textLayer };
}

export function isRenderCancellation(error: unknown): boolean {
  return error instanceof RenderingCancelledException || (error instanceof Error && error.name === "RenderingCancelledException");
}
