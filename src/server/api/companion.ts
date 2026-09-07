import { bodyLimit } from "hono/body-limit";
import type { Context, Hono } from "hono";

import { buildReaderContext } from "../../domain/readerContext";
import {
  parseCompanionAnswer,
  parseCompanionChatRequest,
  parseCompanionQuestionRequest,
  COMPANION_MAX_IMAGE_DATA_URL_LENGTH,
  type CompanionCapabilities,
  type CompanionConversation,
} from "../../shared/companion";
import type { CompanionProvider } from "../ai/companion";
import { companionCapabilities } from "../ai/companion";
import type { CodexChatService } from "../ai/codex";
import { createReaderToolHandler } from "../ai/codexTools";
import type { SQLiteConversationRepository } from "../db/conversations";
import type { SQLiteCodexThreadRepository } from "../db/codexThreads";
import type { SQLiteReaderRepository } from "../db/reader";
import { isRecord } from "../../shared/reader";
import { rejectForeignOrigin } from "./reader";

const MAX_COMPANION_BODY_BYTES = 4 * 1024 * 1024;

type CompanionRouteDependencies = {
  getReaderRepository: () => SQLiteReaderRepository;
  getConversationRepository: () => SQLiteConversationRepository;
  getProvider: (provider: "demo" | "openai" | "deepseek" | "codex") => CompanionProvider | undefined;
  getChatService?: () => CodexChatService | undefined;
  getCodexThreadRepository?: () => SQLiteCodexThreadRepository;
  getCapabilities?: () => CompanionCapabilities;
};

function bookIdFromPath(context: Context): string | undefined {
  const id = context.req.param("bookId");
  return id && /^[0-9a-f-]{16,64}$/i.test(id) ? id : undefined;
}

function visibleConversations(conversations: CompanionConversation[], boundary: number): CompanionConversation[] {
  return conversations.filter((conversation) => conversation.status !== "answered" || (conversation.maxContextPage <= boundary && conversation.evidencePages.every((page) => page <= boundary)));
}

function chatFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("already answering")) return "This book is already answering another message. Try again in a moment.";
  if (message.includes("unauthorized") || message.includes("login") || message.includes("authentication")) return "The local Codex companion is not signed in. Sign in to Codex, then retry this message.";
  if (message.includes("exited") || message.includes("executable") || message.includes("spawn")) return "The local Codex companion is unavailable. Check the Codex installation, then retry this message.";
  if (message.includes("timed out")) return "The local Codex companion took too long to answer. Retry this message.";
  return "Chat could not answer right now. Your message is saved; use Retry below.";
}

function registerConversationListRoute(app: Hono, path: string, dependencies: CompanionRouteDependencies): void {
  app.get(path, (context) => {
    const bookId = bookIdFromPath(context);
    if (!bookId) return context.json({ error: "invalid_book_id" }, 400);
    const book = dependencies.getReaderRepository().findById(bookId);
    if (!book) return context.json({ error: "book_not_found" }, 404);
    return context.json({ conversations: visibleConversations(dependencies.getConversationRepository().listByBookId(bookId), book.state.spoilerBoundaryPage) });
  });
}

function registerConversationResolutionRoute(app: Hono, path: string, dependencies: CompanionRouteDependencies): void {
  app.patch(path, bodyLimit({ maxSize: 64 * 1024, onError: (context: Context) => context.json({ error: "request_too_large" }, 413) }), async (context) => {
    const forbidden = rejectForeignOrigin(context);
    if (forbidden) return forbidden;
    const bookId = bookIdFromPath(context);
    const conversationId = context.req.param("conversationId");
    if (!bookId || !conversationId) return context.json({ error: "invalid_conversation_id" }, 400);
    const existing = dependencies.getConversationRepository().findById(conversationId);
    if (!existing || existing.bookId !== bookId) return context.json({ error: "conversation_not_found" }, 404);
    let body: unknown;
    try { body = await context.req.json(); } catch { return context.json({ error: "invalid_json" }, 400); }
    if (!isRecord(body)) return context.json({ error: "validation_failed", issues: [{ field: "body", message: "Expected a JSON object." }] }, 400);
    const hasResolved = "resolved" in body;
    const hasKept = "kept" in body;
    if (!hasResolved && !hasKept) return context.json({ error: "validation_failed", issues: [{ field: "body", message: "Expected resolved or kept." }] }, 400);
    if (hasResolved && typeof body.resolved !== "boolean") return context.json({ error: "validation_failed", issues: [{ field: "resolved", message: "Expected a boolean." }] }, 400);
    if (hasKept && typeof body.kept !== "boolean") return context.json({ error: "validation_failed", issues: [{ field: "kept", message: "Expected a boolean." }] }, 400);
    let updated = existing;
    if (hasResolved) updated = dependencies.getConversationRepository().setResolved(conversationId, body.resolved as boolean) ?? updated;
    if (hasKept) updated = dependencies.getConversationRepository().setKept(conversationId, body.kept as boolean) ?? updated;
    return context.json(updated);
  });
}

export function registerCompanionRoutes(app: Hono, dependencies: CompanionRouteDependencies): void {
  app.get("/api/companion/capabilities", (context) => context.json(dependencies.getCapabilities?.() ?? companionCapabilities()));

  for (const path of ["/api/companion/books/:bookId/conversations", "/api/reader/books/:bookId/conversations"]) registerConversationListRoute(app, path, dependencies);
  for (const path of ["/api/companion/books/:bookId/conversations/:conversationId", "/api/reader/books/:bookId/conversations/:conversationId"]) registerConversationResolutionRoute(app, path, dependencies);

  app.get("/api/companion/books/:bookId/chat", (context) => {
    const bookId = bookIdFromPath(context);
    if (!bookId) return context.json({ error: "invalid_book_id" }, 400);
    const book = dependencies.getReaderRepository().findById(bookId);
    if (!book) return context.json({ error: "book_not_found" }, 404);
    return context.json({ conversations: dependencies.getConversationRepository().listByBookId(bookId) });
  });

  app.post(
    "/api/companion/chat",
    bodyLimit({ maxSize: MAX_COMPANION_BODY_BYTES, onError: (context: Context) => context.json({ error: "chat_too_large" }, 413) }),
    async (context) => {
      const forbidden = rejectForeignOrigin(context);
      if (forbidden) return forbidden;
      if (!dependencies.getChatService || !dependencies.getCodexThreadRepository) return context.json({ error: "chat_not_configured" }, 503);
      let payload: unknown;
      try { payload = await context.req.json(); } catch { return context.json({ error: "invalid_json" }, 400); }
      const parsed = parseCompanionChatRequest(payload);
      if (!parsed.ok) return context.json({ error: "validation_failed", issues: parsed.issues }, 400);
      const request = parsed.value;
      const reader = dependencies.getReaderRepository();
      const book = reader.findById(request.bookId);
      if (!book) return context.json({ error: "book_not_found" }, 404);
      if (request.selection && (request.selection.pageNumber < 1 || request.selection.pageNumber > book.pageCount)) return context.json({ error: "invalid_page", reason: "selection_page_out_of_range" }, 400);
      const state = reader.getState(book.id);
      if (!state) return context.json({ error: "book_not_found" }, 404);
      const thread = dependencies.getCodexThreadRepository().findByBookId(book.id);
      const service = dependencies.getChatService();
      if (!service) return context.json({ error: "chat_not_configured" }, 503);
      if (service.isBusy?.(book.id)) return context.json({ error: "chat_busy", reason: "This book is already answering another message." }, 409);
      const repository = dependencies.getConversationRepository();
      const pending = repository.createPending({
        bookId: book.id,
        question: request.message,
        mode: "explain",
        provider: service.provider,
        pageNumber: state.currentPage,
        selection: request.selection,
      });
      try {
        const result = await service.chat({
          book,
          state,
          message: request.message,
          selection: request.selection,
          threadId: thread?.threadId,
          tools: createReaderToolHandler(reader, book, state),
          onThreadId: (threadId) => { dependencies.getCodexThreadRepository?.()?.save(book.id, threadId); },
        });
        dependencies.getCodexThreadRepository().save(book.id, result.threadId);
        const saved = repository.answer(pending.id, {
          answer: result.answer,
          citations: result.citations.map(({ pageNumber }) => ({ pageNumber })),
          evidencePages: result.evidencePages,
          maxContextPage: result.maxContextPage,
          supplementary: false,
          insufficientContext: false,
        });
        return context.json(saved ?? pending, 201);
      } catch (error) {
        const failed = repository.fail(pending.id, chatFailureMessage(error));
        return context.json({ error: "companion_unavailable", conversation: failed ?? pending }, 502);
      }
    },
  );

  app.post(
    "/api/companion/questions",
    bodyLimit({ maxSize: MAX_COMPANION_BODY_BYTES, onError: (context: Context) => context.json({ error: "question_too_large" }, 413) }),
    async (context) => {
      const forbidden = rejectForeignOrigin(context);
      if (forbidden) return forbidden;
      let payload: unknown;
      try { payload = await context.req.json(); } catch { return context.json({ error: "invalid_json" }, 400); }
      const parsed = parseCompanionQuestionRequest(payload);
      if (!parsed.ok) return context.json({ error: "validation_failed", issues: parsed.issues }, 400);
      let request = parsed.value;
      if (request.selection?.regionImageDataUrl && request.selection.regionImageDataUrl.length > COMPANION_MAX_IMAGE_DATA_URL_LENGTH) return context.json({ error: "validation_failed", issues: [{ field: "selection.regionImageDataUrl", message: "Image is too large." }] }, 400);
      const reader = dependencies.getReaderRepository();
      const book = reader.findById(request.bookId);
      if (!book) return context.json({ error: "book_not_found" }, 404);
      for (const page of [request.pageNumber, request.pageFrom, request.pageTo, request.selection?.pageNumber]) {
        if (page !== undefined && (page < 1 || page > book.pageCount)) return context.json({ error: "invalid_page", reason: "page_out_of_range" }, 400);
      }
      if (request.pageNumber !== undefined && request.pageNumber > book.state.spoilerBoundaryPage) return context.json({ error: "spoiler_boundary_violation", reason: "question_exceeds_boundary" }, 400);
      if (request.mode === "orient" && ((request.pageFrom !== undefined && request.pageFrom > book.state.spoilerBoundaryPage) || (request.pageTo !== undefined && request.pageTo > book.state.spoilerBoundaryPage))) return context.json({ error: "spoiler_boundary_violation", reason: "orientation_range_exceeds_boundary" }, 400);
      if (request.selection) {
        if (request.selection.pageNumber > book.state.spoilerBoundaryPage) return context.json({ error: "spoiler_boundary_violation", reason: "selection_exceeds_boundary" }, 400);
        if (request.pageNumber !== undefined && request.pageNumber !== request.selection.pageNumber) return context.json({ error: "selection_page_mismatch" }, 400);
        if (request.pageNumber === undefined) request = { ...request, pageNumber: request.selection.pageNumber };
      }
      const contextData = buildReaderContext(request, book.state, reader.getAllPageText(book.id), dependencies.getConversationRepository().listByBookId(book.id));
      const conversationRepository = dependencies.getConversationRepository();
      const pending = conversationRepository.createPending(request);
      const provider = dependencies.getProvider(request.provider ?? "demo");
      if (!provider) {
        const failed = conversationRepository.fail(pending.id, "Live companion credentials are not configured. Choose the deterministic demo provider or configure a supported live provider.");
        return context.json({ error: "provider_not_configured", conversation: failed ?? pending }, 503);
      }
      try {
        const raw = await provider.answer({ question: request.question, mode: request.mode, context: contextData.text, allowedPages: contextData.citationPages, bookTitle: book.title, author: book.author, selection: request.selection });
        const validated = parseCompanionAnswer(raw, new Set(contextData.citationPages));
        if (!validated.ok) {
          const failed = conversationRepository.fail(pending.id, "The companion returned an answer that could not be grounded in the supplied pages.");
          return context.json({ error: "invalid_provider_output", conversation: failed ?? pending }, 502);
        }
        const answer = validated.value;
        const saved = conversationRepository.answer(pending.id, {
          ...answer,
          citations: answer.citations.map(({ pageNumber }) => ({ pageNumber })),
          evidencePages: contextData.citationPages,
          maxContextPage: contextData.maxContextPage,
        });
        return context.json(saved ?? pending, 201);
      } catch {
        const failed = conversationRepository.fail(pending.id, "The companion could not answer right now. Your question is saved for retry.");
        return context.json({ error: "companion_unavailable", conversation: failed ?? pending }, 502);
      }
    },
  );
}
