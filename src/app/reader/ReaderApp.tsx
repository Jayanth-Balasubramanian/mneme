import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CompanionConversation } from "../../shared/companion";

import {
  disposePdfDocument,
  openPdfBytes,
  parseLocalPdf,
  PdfAdapterError,
  type ParsedLocalPdf,
} from "./pdfAdapter";
import { PdfViewer } from "./PdfViewer";
import type {
  ReaderBook,
  ReaderBookSummary,
  ReaderOutlineItem,
  ReaderSelection,
  ReaderState,
} from "../../shared/reader";

type PendingImport = { file: File; parsed: ParsedLocalPdf; title: string; author: string };
type LoadStatus = "idle" | "loading" | "ready" | "error";

function getMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) return fallback;
  if ("reason" in body && typeof body.reason === "string") return body.reason.replaceAll("_", " ");
  if ("error" in body && typeof body.error === "string") return body.error.replaceAll("_", " ");
  return fallback;
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.pdf$/i, "").trim() || "Untitled PDF";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function outlineDestination(item: ReaderOutlineItem): number | undefined {
  return item.pageNumber;
}

function OutlineTree({ items, onNavigate }: { items: ReaderOutlineItem[]; onNavigate: (page: number) => void }) {
  if (items.length === 0) return <p className="outline-empty">No outline in this PDF.</p>;
  return (
    <ul className="outline-tree">
      {items.map((item, index) => (
        <li key={`${item.title}-${index}`}>
          {outlineDestination(item) ? (
            <button className="outline-link" onClick={() => onNavigate(item.pageNumber!)}>
              <span>{item.title}</span><small>{item.pageNumber}</small>
            </button>
          ) : <span className="outline-label">{item.title}</span>}
          {item.children.length > 0 ? <OutlineTree items={item.children} onNavigate={onNavigate} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function ReaderApp() {
  const [books, setBooks] = useState<ReaderBookSummary[]>([]);
  const [activeBook, setActiveBook] = useState<ReaderBook | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [regionMode, setRegionMode] = useState(false);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [conversations, setConversations] = useState<CompanionConversation[]>([]);
  const [question, setQuestion] = useState("");
  const [questionStatus, setQuestionStatus] = useState<"idle" | "sending">("idle");
  const questionInputRef = useRef<HTMLTextAreaElement>(null);
  const [companionOpen, setCompanionOpen] = useState(true);
  const [companionWide, setCompanionWide] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(true);
  const stateDirty = useRef(false);
  const activeBookRef = useRef<ReaderBook | null>(null);
  const stateReadyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const stateConflictRef = useRef(false);
  const draftVersionRef = useRef(0);
  const loadToken = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentState = activeBook?.state;
  const currentPage = currentState?.currentPage ?? 1;
  const zoom = currentState?.zoom ?? 1;

  const flushState = useCallback(async (bookId?: string): Promise<boolean> => {
    if (saveInFlightRef.current) {
      const priorResult = await saveInFlightRef.current.catch(() => false);
      if (bookId && activeBookRef.current?.id !== bookId) return priorResult;
    }
    if (!stateReadyRef.current || !stateDirty.current) return true;
    const snapshot = activeBookRef.current;
    if (!snapshot || (bookId && snapshot.id !== bookId)) return true;
    const snapshotState = snapshot.state;
    const snapshotVersion = draftVersionRef.current;
    const operation = (async () => {
      const response = await fetch(`/api/reader/books/${snapshot.id}/state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...snapshotState, revision: snapshotState.revision }),
        keepalive: true,
      });
      if (!response.ok) {
        if (activeBookRef.current?.id === snapshot.id) {
          stateConflictRef.current = response.status === 409;
          setError(response.status === 409 ? "This book changed elsewhere. Copy your latest note if you need it, then choose this book again to reload the saved state." : "Your latest reading position could not be saved. It will retry.");
        }
        if (response.status !== 409 && activeBookRef.current?.id === snapshot.id && stateDirty.current) window.setTimeout(() => void flushState(snapshot.id), 1_500);
        return false;
      }
      const saved = (await response.json()) as ReaderState;
      if (activeBookRef.current?.id === snapshot.id && draftVersionRef.current === snapshotVersion) {
        stateDirty.current = false;
        stateConflictRef.current = false;
        activeBookRef.current = { ...activeBookRef.current, state: saved };
        setActiveBook((current) => current && current.id === snapshot.id ? { ...current, state: saved } : current);
      } else if (activeBookRef.current?.id === snapshot.id) {
        const current = activeBookRef.current;
        const merged = { ...current, state: { ...current.state, revision: saved.revision, updatedAt: saved.updatedAt } };
        activeBookRef.current = merged;
        setActiveBook((currentBook) => currentBook && currentBook.id === snapshot.id ? merged : currentBook);
      }
      return true;
    })();
    saveInFlightRef.current = operation;
    try {
      const result = await operation;
      if (result && activeBookRef.current?.id === snapshot.id && stateDirty.current && draftVersionRef.current !== snapshotVersion) return flushState(snapshot.id);
      return result;
    } catch {
      if (activeBookRef.current?.id === snapshot.id) setError("Your latest reading position could not be saved. It will retry.");
      if (activeBookRef.current?.id === snapshot.id && stateDirty.current) window.setTimeout(() => void flushState(snapshot.id), 1_500);
      return false;
    } finally {
      if (saveInFlightRef.current === operation) saveInFlightRef.current = null;
    }
  }, []);

  const scheduleStateSave = useCallback((): void => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void flushState();
    }, 450);
  }, [flushState]);

  const refreshBooks = useCallback(async (): Promise<ReaderBookSummary[]> => {
    const response = await fetch("/api/reader/books");
    if (!response.ok) throw new Error("Unable to load the local library.");
    const body = (await response.json()) as { books?: ReaderBookSummary[] };
    const nextBooks = body.books ?? [];
    setBooks(nextBooks);
    return nextBooks;
  }, []);

  const loadConversations = useCallback(async (bookId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/companion/books/${bookId}/chat`);
      if (!response.ok) return;
      const body = await response.json() as { conversations?: CompanionConversation[] };
      if (activeBookRef.current?.id === bookId) {
        setConversations(body.conversations ?? []);
      }
    } catch {
      // A history refresh is best effort; the reading position remains available.
    }
  }, []);

  const openBook = useCallback(async (bookId: string): Promise<void> => {
    const reloadingConflict = activeBookRef.current?.id === bookId && stateConflictRef.current;
    const flushed = reloadingConflict ? true : await flushState(activeBookRef.current?.id);
    if (!flushed && activeBookRef.current) return;
    if (reloadingConflict) {
      stateDirty.current = false;
      stateConflictRef.current = false;
    }
    const token = loadToken.current + 1;
    loadToken.current = token;
    setLoadStatus("loading");
    setError(null);
    stateReadyRef.current = false;
    try {
      const [bookResponse, pdfResponse] = await Promise.all([
        fetch(`/api/reader/books/${bookId}`),
        fetch(`/api/reader/books/${bookId}/pdf`),
      ]);
      if (!bookResponse.ok || !pdfResponse.ok) throw new Error("This book is no longer available in the local library.");
      const book = (await bookResponse.json()) as ReaderBook;
      const bytes = new Uint8Array(await pdfResponse.arrayBuffer());
      const document = await openPdfBytes(bytes);
      if (token !== loadToken.current) {
        disposePdfDocument(document);
        return;
      }
      setPdfDocument((previous) => {
        if (previous) disposePdfDocument(previous);
        return document;
      });
      activeBookRef.current = book;
      setActiveBook(book);
      setConversations([]);
      setQuestion("");
      void loadConversations(book.id);
      setLoadStatus("ready");
      stateDirty.current = false;
      stateReadyRef.current = true;
      setSelection(null);
    } catch (openError) {
      if (token !== loadToken.current) return;
      setLoadStatus("error");
      setError(openError instanceof Error ? openError.message : "Unable to open this book.");
    }
  }, [flushState, loadConversations]);

  useEffect(() => {
    void refreshBooks().then((nextBooks) => {
      if (nextBooks[0]) void openBook(nextBooks[0].id);
    }).catch((loadError: unknown) => {
      setLoadStatus("error");
      setError(loadError instanceof Error ? loadError.message : "Unable to load the local library.");
    });
  }, [openBook, refreshBooks]);

  useEffect(() => {
    if (!activeBook) {
      setConversations([]);
      return;
    }
    void loadConversations(activeBook.id);
  }, [activeBook?.id, loadConversations]);

  useEffect(() => () => {
    if (pdfDocument) disposePdfDocument(pdfDocument);
  }, [pdfDocument]);

  useEffect(() => {
    const saveOnHide = () => { void flushState(activeBookRef.current?.id); };
    window.addEventListener("pagehide", saveOnHide);
    return () => window.removeEventListener("pagehide", saveOnHide);
  }, [flushState]);

  useEffect(() => {
    const navigateWithKeyboard = (event: KeyboardEvent): void => {
      if (!activeBookRef.current || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("input, select, textarea, [contenteditable='true']") || target.isContentEditable)) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        handlePageChange((activeBookRef.current.state.currentPage ?? 1) + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        handlePageChange((activeBookRef.current.state.currentPage ?? 1) - 1);
      }
    };
    window.addEventListener("keydown", navigateWithKeyboard);
    return () => window.removeEventListener("keydown", navigateWithKeyboard);
  });

  function updateState(patch: Partial<ReaderState>): void {
    const current = activeBookRef.current;
    if (!current) return;
    const next = { ...current, state: { ...current.state, ...patch } };
    activeBookRef.current = next;
    stateDirty.current = true;
    draftVersionRef.current += 1;
    setActiveBook(next);
    scheduleStateSave();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError(null);
    setLoadStatus("loading");
    try {
      const parsed = await parseLocalPdf(file);
    setPendingImport({ file, parsed, title: parsed.title ?? titleFromFilename(file.name), author: parsed.author ?? "" });
      setLoadStatus("idle");
    } catch (parseError) {
      setLoadStatus("error");
      setError(parseError instanceof PdfAdapterError ? parseError.message : "Unable to parse this PDF locally.");
    }
  }

  async function importPending(): Promise<void> {
    if (!pendingImport) return;
    const flushed = await flushState(activeBookRef.current?.id);
    if (!flushed && activeBookRef.current) return;
    stateReadyRef.current = false;
    setLoadStatus("loading");
    setError(null);
    const metadata = {
      originalFilename: pendingImport.file.name,
      title: pendingImport.title.trim(),
      ...(pendingImport.author.trim() ? { author: pendingImport.author.trim() } : {}),
      pageCount: pendingImport.parsed.pages.length,
      pages: pendingImport.parsed.pages,
      outline: pendingImport.parsed.outline,
    };
    const formData = new FormData();
    formData.set("file", pendingImport.file, pendingImport.file.name);
    formData.set("metadata", JSON.stringify(metadata));
    try {
      const response = await fetch("/api/reader/books/import", { method: "POST", body: formData });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getMessage(body, "The PDF could not be imported."));
      const book = body as ReaderBook;
      setPdfDocument((previous) => {
        if (previous) disposePdfDocument(previous);
        return pendingImport.parsed.document;
      });
      setActiveBook(book);
      activeBookRef.current = book;
      setSelection(null);
      setQuestion("");
      setConversations([]);
      stateConflictRef.current = false;
      void loadConversations(book.id);
      setPendingImport(null);
      stateDirty.current = false;
      stateReadyRef.current = true;
      draftVersionRef.current += 1;
      setLoadStatus("ready");
      await refreshBooks();
    } catch (importError) {
      setLoadStatus("error");
      setError(importError instanceof Error ? importError.message : "The PDF could not be imported.");
    }
  }

  function handlePageChange(nextPage: number): void {
    if (!activeBook) return;
    const page = Math.min(activeBook.pageCount, Math.max(1, Math.round(nextPage)));
    updateState({ currentPage: page, scrollTop: 0 });
    setSelection(null);
  }

  async function askCompanion(): Promise<void> {
    if (!activeBook || questionStatus === "sending") return;
    const prompt = question.trim();
    if (!prompt) {
      questionInputRef.current?.focus();
      return;
    }
    const bookId = activeBook.id;
    setQuestionStatus("sending");
    setError(null);
    const flushed = await flushState(bookId);
    if (!flushed || activeBookRef.current?.id !== bookId) {
      setQuestionStatus("idle");
      return;
    }
    const attachedSelection = selection
      ? { ...selection, rectangles: selection.rectangles.slice(0, 32) }
      : undefined;
    const body = { bookId, message: prompt, ...(attachedSelection ? { selection: attachedSelection } : {}) };
    try {
      const response = await fetch("/api/companion/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const responseBody = await response.json() as CompanionConversation | { conversation?: CompanionConversation; error?: string };
      const saved = "conversation" in responseBody ? responseBody.conversation : responseBody;
      if (activeBookRef.current?.id !== bookId) return;
      if (saved && typeof saved === "object" && "id" in saved) setConversations((current) => [...current.filter((conversation) => conversation.id !== saved.id), saved as CompanionConversation]);
      if (!response.ok) {
        if ("conversation" in responseBody && responseBody.conversation?.status === "failed") setError("Chat could not answer right now. Your message is saved; use Retry below.");
        else {
          const firstIssue = "issues" in responseBody && Array.isArray(responseBody.issues)
            ? responseBody.issues.find((issue): issue is { message: string } => typeof issue === "object" && issue !== null && "message" in issue && typeof issue.message === "string")
            : undefined;
          setError(firstIssue?.message ?? "The chat request was rejected. Check the message and try again.");
        }
        return;
      }
      setQuestion("");
    } catch {
      setError("Chat could not be reached. Your message stays in this form for retry.");
    } finally {
      setQuestionStatus("idle");
    }
  }

  function retryConversation(conversation: CompanionConversation): void {
    setQuestion(conversation.question);
    setSelection(conversation.selection ?? null);
    setError(null);
    questionInputRef.current?.focus();
  }

  const companionTitle = selection?.regionImageDataUrl ? "Region context" : selection ? "Selected passage" : "Companion";
  const pageTextLabel = useMemo(() => `Page ${currentPage} of ${activeBook?.pageCount ?? "—"}`, [activeBook?.pageCount, currentPage]);

  return (
    <main className="reader-app">
      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" onChange={(event) => void handleFileChange(event)} hidden />

      {error ? <div className="reader-alert" role="alert"><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error">×</button></div> : null}

      <div className={`reader-layout${navOpen ? "" : " reader-layout--nav-closed"}${companionOpen ? "" : " reader-layout--companion-closed"}${companionWide ? " reader-layout--companion-wide" : ""}`}>
        <aside className={`library-sidebar${navOpen ? "" : " library-sidebar--closed"}`}>
          <div className="sidebar-heading"><div><p className="reader-kicker">Your shelf</p><h2>Library</h2></div><button className="icon-button" onClick={() => setNavOpen((open) => !open)} aria-label="Collapse library">‹</button></div>
          <button className="button button--dark sidebar-import" onClick={() => fileInputRef.current?.click()} data-testid="import-pdf">Import PDF</button>
          <div className="library-list">
            {books.length === 0 ? <div className="empty-shelf"><span className="empty-shelf-icon">◌</span><p>Your next good book belongs here.</p><small>Import a text PDF to begin.</small></div> : books.map((book) => <button key={book.id} className={`library-book${activeBook?.id === book.id ? " library-book--active" : ""}`} onClick={() => void openBook(book.id)}><span className="book-spine" /><span className="library-book-copy"><strong>{book.title}</strong><small>{book.author ?? book.originalFilename}</small><em>{book.pageCount} pages · {formatFileSize(book.byteSize)}</em></span></button>)}
          </div>
          {activeBook ? <details className="outline-panel" open><summary>Contents</summary><OutlineTree items={activeBook.outline} onNavigate={handlePageChange} /></details> : null}
          <div className="sidebar-footer"><span className="status-ring" /> Stored on this device</div>
        </aside>
        {!navOpen ? <button className="nav-reopen" onClick={() => setNavOpen(true)} aria-label="Open library">›</button> : null}

        <section className="reader-main">
          {!activeBook || loadStatus === "loading" ? (
            <div className="reader-welcome"><div className="welcome-orbit">✦</div><p className="reader-kicker">A quiet place for difficult pages</p><h2>{loadStatus === "loading" ? "Opening your book…" : "Bring a book into focus."}</h2><p>Import a text PDF and Mneme will keep your place, your notes, and the questions that matter close to the page.</p><button className="button button--dark" onClick={() => fileInputRef.current?.click()}>Choose a PDF</button></div>
          ) : (
            <>
              <div className="book-toolbar">
                <div className="book-heading"><p className="reader-kicker">Now reading</p><h2>{activeBook.title}</h2><span>{activeBook.author ?? activeBook.originalFilename}</span></div>
                <div className="reader-controls">
                  <button className="toolbar-button" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">←</button>
                  <label className="page-control"><input aria-label="Current page" type="number" min="1" max={activeBook.pageCount} value={currentPage} onChange={(event) => handlePageChange(Number(event.currentTarget.value))} /><span>/ {activeBook.pageCount}</span></label>
                  <button className="toolbar-button" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= activeBook.pageCount} aria-label="Next page">→</button>
                  <span className="toolbar-separator" />
                  <button className="toolbar-button" onClick={() => updateState({ zoom: Math.max(0.5, Number((zoom - 0.1).toFixed(1))) })} disabled={zoom <= 0.5} aria-label="Zoom out">−</button><span className="zoom-label">{Math.round(zoom * 100)}%</span><button className="toolbar-button" onClick={() => updateState({ zoom: Math.min(3, Number((zoom + 0.1).toFixed(1))) })} disabled={zoom >= 3} aria-label="Zoom in">＋</button>
                  <span className="toolbar-separator" />
                  <button className={`toolbar-button${regionMode ? " toolbar-button--selected" : ""}`} onClick={() => setRegionMode((mode) => !mode)} aria-pressed={regionMode} title="Capture a page region">⌗</button>
                  <button className="toolbar-button" onClick={() => setCompanionOpen((open) => !open)} aria-label="Toggle companion panel">◧</button>
                </div>
              </div>
              <div className="reader-stage">
                <div className="reader-stage__inner">
                  <div className="reading-context"><span>{pageTextLabel}</span><span>{regionMode ? "Drag over a region to capture it" : "Select text to bring it here"}</span></div>
                  <PdfViewer document={pdfDocument} currentPage={currentPage} zoom={zoom} regionMode={regionMode} initialScrollTop={currentState?.scrollTop ?? 0} onSelection={setSelection} onScrollTopChange={(scrollTop) => updateState({ scrollTop })} />
                </div>
              </div>
            </>
          )}
        </section>

        {companionOpen ? <aside className="companion-panel">
          <div className="companion-heading"><div><p className="reader-kicker">Companion</p><h2>{companionTitle}</h2></div><div className="companion-heading-actions"><button className="panel-size-button" onClick={() => setCompanionWide((wide) => !wide)}>{companionWide ? "Compact" : "Wide"}</button><button className="icon-button" onClick={() => setCompanionOpen(false)} aria-label="Close companion">×</button></div></div>
          {selection ? <div className="selection-card selection-card--attachment">{selection.regionImageDataUrl ? <img src={selection.regionImageDataUrl} alt="Captured page region" className="region-preview" /> : <blockquote>“{selection.text}”</blockquote>}<span className="selection-anchor">Page {selection.pageNumber} · attached</span><button className="selection-remove" onClick={() => setSelection(null)} aria-label="Remove selection">×</button></div> : conversations.length === 0 ? <div className="companion-empty"><div className="companion-icon">⌁</div><h3>Ask alongside the page.</h3><p>Ask a question about this book, or select a passage to attach it to the message.</p></div> : null}
          <div className="conversation-history"><div className="history-heading"><p className="reader-kicker">Chat</p><span>{conversations.length} messages</span></div>{conversations.length === 0 ? <p className="history-empty">Your conversation will stay with this book.</p> : conversations.map((conversation) => <article className={`conversation-card chat-message chat-message--${conversation.status}`} key={conversation.id}><div className="conversation-question"><span>{conversation.status === "failed" ? "Could not answer" : conversation.provider === "demo" ? "Demo" : "Mneme"}</span>{conversation.status === "failed" ? <button onClick={() => retryConversation(conversation)}>Retry</button> : null}</div><p className="chat-message__question">{conversation.question}</p>{conversation.answer ? <div className="chat-message__answer">{conversation.answer.split(/\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div> : <p className="conversation-error">{conversation.errorMessage ?? "Waiting to retry this message."}</p>}<div className="conversation-citations">{conversation.citations.map((citation, index) => <button key={`${citation.pageNumber}-${index}`} onClick={() => handlePageChange(citation.pageNumber)}>Page {citation.pageNumber}</button>)}</div></article>)}</div>
          <div className="question-composer"><textarea ref={questionInputRef} aria-label="Companion question" placeholder={selection ? "Ask about the attached passage…" : "Ask anything about this book…"} value={question} onChange={(event) => setQuestion(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askCompanion(); } }} /><div className="composer-footer"><span>Book chat · current position included</span><button className="button button--dark" onClick={() => void askCompanion()} disabled={questionStatus === "sending" || !activeBook} data-testid="ask-companion">{questionStatus === "sending" ? "Thinking…" : "Send"}</button></div></div>
          <div className="stopping-note memory-panel"><button className="memory-toggle" onClick={() => setMemoryOpen((open) => !open)} aria-expanded={memoryOpen}>Memory <span>{memoryOpen ? "Hide" : "Edit"}</span></button>{memoryOpen ? <><p className="note-help">A short note Mneme can remember when you return.</p><textarea aria-label="Stopping note" placeholder="What do you want to remember about this book?" value={currentState?.stoppingNote ?? ""} onChange={(event) => updateState({ stoppingNote: event.currentTarget.value })} /></> : null}</div>
        </aside> : null}
      </div>

          {pendingImport ? <div className="import-sheet" role="dialog" aria-modal="true"><div className="import-sheet__card"><button className="sheet-close" onClick={() => setPendingImport(null)} aria-label="Cancel import">×</button><p className="reader-kicker">Ready to shelve</p><h2>Give this book a name.</h2><p className="sheet-description">PDF.js found {pendingImport.parsed.pages.length} pages of selectable text in <strong>{pendingImport.file.name}</strong>.</p><label>Title<input data-testid="import-title" value={pendingImport.title} onChange={(event) => setPendingImport((current) => current ? { ...current, title: event.currentTarget.value } : current)} autoFocus /></label><label>Author <span className="optional">optional</span><input data-testid="import-author" value={pendingImport.author} onChange={(event) => setPendingImport((current) => current ? { ...current, author: event.currentTarget.value } : current)} /></label><div className="sheet-actions"><button className="button button--quiet" onClick={() => setPendingImport(null)}>Cancel</button><button className="button button--dark" disabled={!pendingImport.title.trim()} onClick={() => void importPending()} data-testid="confirm-import">Save to library</button></div></div></div> : null}
    </main>
  );
}
