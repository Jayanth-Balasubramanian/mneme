import type { ReaderSelection, ValidationIssue, ValidationResult } from "./reader";
import { isRecord } from "./reader";

export const COMPANION_MAX_QUESTION_LENGTH = 4_000;
export const COMPANION_MAX_CONTEXT_CHARS = 12_000;
export const COMPANION_MAX_IMAGE_DATA_URL_LENGTH = 2_500_000;

export type CompanionMode = "explain" | "define" | "missing-step" | "orient";
export type CompanionProviderName = "demo" | "openai" | "deepseek" | "codex";

export type CompanionCitation = {
  pageNumber: number;
  quote?: string;
};

export type CompanionAnswer = {
  answer: string;
  citations: CompanionCitation[];
  supplementary: boolean;
  insufficientContext: boolean;
};

export type CompanionQuestionRequest = {
  bookId: string;
  question: string;
  mode: CompanionMode;
  provider?: CompanionProviderName;
  pageNumber?: number;
  pageFrom?: number;
  pageTo?: number;
  selection?: ReaderSelection;
};

export type CompanionChatRequest = {
  bookId: string;
  message: string;
  selection?: ReaderSelection;
};

export type CompanionChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CompanionChatResult = {
  answer: string;
  citations: CompanionCitation[];
  evidencePages: number[];
  maxContextPage: number;
};

export type CompanionChatToolName = "get_reader_position" | "search_book" | "read_pages";

export type CompanionChatToolCall = {
  name: CompanionChatToolName;
  arguments: Record<string, unknown>;
};

export type CompanionConversation = {
  id: string;
  bookId: string;
  question: string;
  mode: CompanionMode;
  provider: CompanionProviderName;
  pageNumber?: number;
  pageFrom?: number;
  pageTo?: number;
  selection?: ReaderSelection;
  answer?: string;
  citations: CompanionCitation[];
  evidencePages: number[];
  maxContextPage: number;
  supplementary: boolean;
  insufficientContext: boolean;
  status: "pending" | "answered" | "failed";
  errorMessage?: string;
  resolved: boolean;
  kept: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CompanionCapabilities = {
  demoAvailable: true;
  liveAvailable: boolean;
  liveModel?: string;
  deepseekAvailable: boolean;
  deepseekModel: string;
  deepseekVisionModel: string;
};

function selectionIssues(value: unknown): ValidationIssue[] {
  if (value === undefined) return [];
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) return [{ field: "selection", message: "Expected a selection object." }];
  if (typeof value.pageNumber !== "number" || !Number.isInteger(value.pageNumber) || value.pageNumber < 1) issues.push({ field: "selection.pageNumber", message: "Expected a positive physical page number." });
  if (typeof value.text !== "string" || value.text.length > 8_000) issues.push({ field: "selection.text", message: "Expected text up to 8,000 characters." });
  if (!Array.isArray(value.rectangles) || value.rectangles.length > 32) issues.push({ field: "selection.rectangles", message: "Expected up to 32 normalized rectangles." });
  else value.rectangles.forEach((rect, index) => {
    if (!isRecord(rect) || ["x", "y", "width", "height"].some((key) => typeof rect[key] !== "number" || !Number.isFinite(rect[key]) || rect[key] < 0 || rect[key] > 1)) {
      issues.push({ field: `selection.rectangles[${index}]`, message: "Expected normalized rectangle values from 0 to 1." });
    }
  });
  if (value.regionImageDataUrl !== undefined && (typeof value.regionImageDataUrl !== "string" || value.regionImageDataUrl.length > COMPANION_MAX_IMAGE_DATA_URL_LENGTH || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.regionImageDataUrl))) {
    issues.push({ field: "selection.regionImageDataUrl", message: "Expected a bounded PNG data URL." });
  }
  return issues;
}

export function parseCompanionQuestionRequest(payload: unknown): ValidationResult<CompanionQuestionRequest> {
  if (!isRecord(payload)) return { ok: false, issues: [{ field: "body", message: "Expected a JSON object." }] };
  const issues: ValidationIssue[] = [];
  const bookId = payload.bookId;
  if (typeof bookId !== "string" || !/^[0-9a-f-]{16,64}$/i.test(bookId)) issues.push({ field: "bookId", message: "Expected a valid book id." });
  const question = payload.question;
  if (typeof question !== "string" || question.trim().length === 0 || question.trim().length > COMPANION_MAX_QUESTION_LENGTH) issues.push({ field: "question", message: `Expected a question up to ${COMPANION_MAX_QUESTION_LENGTH} characters.` });
  const mode = payload.mode;
  if (mode !== "explain" && mode !== "define" && mode !== "missing-step" && mode !== "orient") issues.push({ field: "mode", message: "Expected explain, define, missing-step, or orient." });
  const provider = payload.provider ?? "demo";
  if (provider !== "demo" && provider !== "openai" && provider !== "deepseek" && provider !== "codex") issues.push({ field: "provider", message: "Expected demo, openai, deepseek, or codex." });
  const pageFields: Array<"pageNumber" | "pageFrom" | "pageTo"> = ["pageNumber", "pageFrom", "pageTo"];
  for (const field of pageFields) {
    const value = payload[field];
    if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 1)) issues.push({ field, message: "Expected a positive physical page number." });
  }
  if (typeof payload.pageFrom === "number" && typeof payload.pageTo === "number" && payload.pageTo < payload.pageFrom) issues.push({ field: "pageTo", message: "Expected pageTo to be at or after pageFrom." });
  issues.push(...selectionIssues(payload.selection));
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: {
    bookId: bookId as string,
    question: (question as string).trim(),
    mode: mode as CompanionMode,
    provider: provider as CompanionProviderName,
    ...(typeof payload.pageNumber === "number" ? { pageNumber: payload.pageNumber } : {}),
    ...(typeof payload.pageFrom === "number" ? { pageFrom: payload.pageFrom } : {}),
    ...(typeof payload.pageTo === "number" ? { pageTo: payload.pageTo } : {}),
    ...(payload.selection === undefined ? {} : { selection: payload.selection as ReaderSelection }),
  } };
}

export function parseCompanionChatRequest(payload: unknown): ValidationResult<CompanionChatRequest> {
  if (!isRecord(payload)) return { ok: false, issues: [{ field: "body", message: "Expected a JSON object." }] };
  const parsed = parseCompanionQuestionRequest({ bookId: payload.bookId, question: payload.message, mode: "explain", selection: payload.selection });
  if (!parsed.ok) {
    return { ok: false, issues: parsed.issues.map((issue) => issue.field === "question" ? { ...issue, field: "message" } : issue) };
  }
  return { ok: true, value: { bookId: parsed.value.bookId, message: parsed.value.question, ...(parsed.value.selection ? { selection: parsed.value.selection } : {}) } };
}

export function parseCompanionAnswer(payload: unknown, allowedPages: Set<number>): ValidationResult<CompanionAnswer> {
  if (!isRecord(payload)) return { ok: false, issues: [{ field: "answer", message: "Expected a structured answer object." }] };
  const issues: ValidationIssue[] = [];
  if (typeof payload.answer !== "string" || payload.answer.trim().length === 0 || payload.answer.length > 20_000) issues.push({ field: "answer", message: "Expected answer text up to 20,000 characters." });
  if (!Array.isArray(payload.citations) || payload.citations.length > 32) issues.push({ field: "citations", message: "Expected up to 32 citations." });
  const citations: CompanionCitation[] = [];
  if (Array.isArray(payload.citations)) payload.citations.forEach((citation, index) => {
    if (!isRecord(citation) || typeof citation.pageNumber !== "number" || !Number.isInteger(citation.pageNumber) || !allowedPages.has(citation.pageNumber)) {
      issues.push({ field: `citations[${index}].pageNumber`, message: "Citation page is outside the supplied context." });
      return;
    }
    if (citation.quote !== undefined && (typeof citation.quote !== "string" || citation.quote.length > 1_000)) issues.push({ field: `citations[${index}].quote`, message: "Citation quote must be at most 1,000 characters." });
    citations.push({ pageNumber: citation.pageNumber, ...(typeof citation.quote === "string" ? { quote: citation.quote } : {}) });
  });
  if (typeof payload.supplementary !== "boolean") issues.push({ field: "supplementary", message: "Expected a boolean." });
  if (typeof payload.insufficientContext !== "boolean") issues.push({ field: "insufficientContext", message: "Expected a boolean." });
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { answer: (payload.answer as string).trim(), citations, supplementary: payload.supplementary as boolean, insufficientContext: payload.insufficientContext as boolean } };
}

export function evidencePagesForAnswer(answer: CompanionAnswer): number[] {
  return [...new Set(answer.citations.map((citation) => citation.pageNumber))].sort((a, b) => a - b);
}
