import type { CompanionConversation, CompanionQuestionRequest } from "../shared/companion";
import { COMPANION_MAX_CONTEXT_CHARS } from "../shared/companion";
import type { ReaderPageText, ReaderState } from "../shared/reader";

export type ReaderContext = {
  text: string;
  allowedPages: number[];
  citationPages: number[];
  maxContextPage: number;
  history: Array<{ question: string; answer: string; citations: Array<{ pageNumber: number }>; evidencePages: number[]; maxContextPage: number }>;
};

function pageSetForRequest(request: CompanionQuestionRequest, state: ReaderState, pageCount: number): number[] {
  const boundary = Math.min(pageCount, Math.max(1, state.spoilerBoundaryPage));
  if (request.mode === "orient" && request.pageFrom !== undefined) {
    const end = Math.min(boundary, request.pageTo ?? request.pageFrom);
    const start = Math.min(end, request.pageFrom);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }
  const anchor = Math.min(boundary, Math.max(1, request.pageNumber ?? state.currentPage));
  const start = Math.max(1, anchor - 2);
  const end = Math.min(boundary, anchor + 2);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function questionTerms(question: string): string[] {
  const ignored = new Set(["define", "explain", "missing", "step", "orient", "what", "where", "does", "this", "that", "about"]);
  return question.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 4 && !ignored.has(term)).slice(0, 8);
}

function earlierDefinitionPages(question: string, pages: ReaderPageText[], maxPage: number): number[] {
  const terms = questionTerms(question);
  if (terms.length === 0) return [];
  return pages.filter((page) => page.pageNumber <= maxPage && terms.some((term) => page.text.toLowerCase().includes(term))).map((page) => page.pageNumber).slice(-3);
}

function clip(text: string, remaining: number): string {
  if (text.length <= remaining) return text;
  return `${text.slice(0, Math.max(0, remaining - 1))}…`;
}

export function buildReaderContext(
  request: CompanionQuestionRequest,
  state: ReaderState,
  pages: ReaderPageText[],
  conversations: CompanionConversation[],
): ReaderContext {
  const safePages = pages.filter((page) => page.bookId === state.bookId);
  const requestedAnchor = request.mode === "orient"
    ? request.pageFrom ?? request.pageNumber ?? state.currentPage
    : request.selection?.pageNumber ?? request.pageNumber ?? state.currentPage;
  const anchor = Math.min(safePages.length, Math.max(1, requestedAnchor));
  const primaryWindow = pageSetForRequest({ ...request, pageNumber: anchor }, state, safePages.length);
  const primary = request.mode === "orient"
    ? primaryWindow
    : [anchor, ...primaryWindow.filter((page) => page !== anchor).sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))];
  const earlier = earlierDefinitionPages(request.selection?.text ?? request.question, safePages, Math.min(state.spoilerBoundaryPage, anchor));
  const orderedPageNumbers = [...new Set([...primary, ...earlier])].filter((pageNumber) => pageNumber <= state.spoilerBoundaryPage);
  let remaining = COMPANION_MAX_CONTEXT_CHARS;
  const snippets: string[] = [];
  const emittedPages = new Set<number>();
  if (request.selection && request.selection.pageNumber <= state.spoilerBoundaryPage) emittedPages.add(request.selection.pageNumber);
  if (request.selection?.text.trim()) {
    const selection = clip(request.selection.text.trim(), Math.min(3_000, remaining));
    snippets.push(`Selected passage (page ${request.selection.pageNumber}):\n${selection}`);
    remaining -= selection.length + 36;
  }
  const terms = request.selection?.text ? questionTerms(request.selection.text) : questionTerms(request.question);
  for (const pageNumber of orderedPageNumbers) {
    const page = safePages.find((entry) => entry.pageNumber === pageNumber);
    if (!page) continue;
    const lowerText = page.text.toLowerCase();
    const matchTerm = terms.find((term) => lowerText.includes(term));
    const matchIndex = matchTerm ? lowerText.indexOf(matchTerm) : -1;
    const sourceText = matchIndex >= 0 ? page.text.slice(Math.max(0, matchIndex - 500), matchIndex + 1_500) : page.text.trim();
    const snippet = `[Page ${page.pageNumber}]\n${clip(sourceText, Math.max(0, remaining - 12))}`;
    if (snippet.length <= 12) continue;
    snippets.push(snippet);
    emittedPages.add(page.pageNumber);
    remaining -= snippet.length + 2;
    if (remaining <= 0) break;
  }
  const history = conversations.filter((conversation) => conversation.bookId === state.bookId && conversation.status === "answered" && conversation.answer && conversation.evidencePages.every((page) => page <= state.spoilerBoundaryPage) && conversation.maxContextPage <= state.spoilerBoundaryPage).slice(-8).map((conversation) => ({ question: conversation.question, answer: conversation.answer!, citations: conversation.citations, evidencePages: conversation.evidencePages, maxContextPage: conversation.maxContextPage }));
  let usedHistory = false;
  if (history.length > 0 && remaining > 100) {
    snippets.push(`Prior bounded exchanges:\n${clip(history.map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`).join("\n\n"), remaining)}`);
    usedHistory = true;
  }
  const allowedPages = [...emittedPages].sort((a, b) => a - b);
  const maxHistoryPage = usedHistory && history.length > 0 ? Math.max(...history.map((entry) => entry.maxContextPage)) : 0;
  return { text: snippets.join("\n\n").slice(0, COMPANION_MAX_CONTEXT_CHARS), allowedPages, citationPages: allowedPages, maxContextPage: Math.max(maxHistoryPage, allowedPages.length > 0 ? Math.max(...allowedPages) : Math.min(state.spoilerBoundaryPage, anchor)), history };
}
