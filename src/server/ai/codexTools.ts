import type { ReaderToolHandler } from "./codex";
import type { ReaderBook, ReaderState } from "../../shared/reader";
import type { SQLiteReaderRepository } from "../db/reader";
import { isRecord } from "../../shared/reader";

const MAX_SEARCH_QUERY = 300;
const MAX_SEARCH_RESULTS = 5;
const MAX_PAGE_TEXT = 1_800;

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function boundedSnippet(text: string, index: number, queryLength: number): string {
  const start = Math.max(0, index - 260);
  const end = Math.min(text.length, index + queryLength + 520);
  return text.slice(start, end).trim();
}

function nearestSection(book: ReaderBook, page: number): string | undefined {
  let nearest: { title: string; pageNumber: number } | undefined;
  const visit = (items: ReaderBook["outline"]): void => {
    for (const item of items) {
      if (item.pageNumber !== undefined && item.pageNumber <= page && (!nearest || item.pageNumber >= nearest.pageNumber)) nearest = { title: item.title, pageNumber: item.pageNumber };
      visit(item.children);
    }
  };
  visit(book.outline);
  return nearest?.title;
}

function parsePages(args: unknown, pageCount: number): number[] {
  if (!isRecord(args) || !Array.isArray(args.pages) || args.pages.length < 1 || args.pages.length > 3) throw new Error("read_pages expects one to three physical page numbers.");
  const pages = args.pages;
  if (pages.some((page) => typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > pageCount)) throw new Error("read_pages received a page outside this book.");
  return [...new Set(pages as number[])];
}

export function createReaderToolHandler(reader: SQLiteReaderRepository, book: ReaderBook, state: ReaderState): ReaderToolHandler {
  return async (name, args): Promise<{ text: string; pages?: number[] }> => {
    if (name === "get_reader_position") {
      if (args !== undefined && (!isRecord(args) || Object.keys(args).length > 0)) throw new Error("get_reader_position takes no arguments.");
      return {
        text: JSON.stringify({
          title: book.title,
          author: book.author ?? null,
          pageCount: book.pageCount,
          currentPage: state.currentPage,
          zoom: state.zoom,
          memory: state.stoppingNote,
          section: nearestSection(book, state.currentPage) ?? null,
        }),
        pages: [],
      };
    }
    if (name === "search_book") {
      if (!isRecord(args) || !hasOnlyKeys(args, ["query"]) || typeof args.query !== "string" || args.query.trim().length === 0 || args.query.trim().length > MAX_SEARCH_QUERY) throw new Error("search_book expects a literal query up to 300 characters.");
      const query = args.query.trim();
      const foldedQuery = query.toLowerCase();
      const matches: Array<{ pageNumber: number; excerpt: string }> = [];
      let moreMatches = false;
      for (const page of reader.getAllPageText(book.id)) {
        const index = page.text.toLowerCase().indexOf(foldedQuery);
        if (index < 0) continue;
        if (matches.length >= MAX_SEARCH_RESULTS) { moreMatches = true; break; }
        matches.push({ pageNumber: page.pageNumber, excerpt: boundedSnippet(page.text, index, query.length) });
      }
      return { text: JSON.stringify({ query, matches, moreMatches }), pages: matches.map((match) => match.pageNumber) };
    }
    if (name === "read_pages") {
      if (!isRecord(args) || !hasOnlyKeys(args, ["pages"])) throw new Error("read_pages expects only a pages array.");
      const pages = parsePages(args, book.pageCount);
      const excerpts = pages.map((pageNumber) => {
        const page = reader.getPageText(book.id, pageNumber);
        const text = page?.text ?? "";
        return { pageNumber, text: text.slice(0, MAX_PAGE_TEXT), truncated: text.length > MAX_PAGE_TEXT };
      });
      return { text: JSON.stringify({ pages: excerpts }), pages };
    }
    throw new Error("Unknown reader tool.");
  };
}
