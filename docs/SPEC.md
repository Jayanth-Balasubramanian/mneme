# Mneme: PDF reader with a contextual companion

## Objective
Help a single reader get started, get unstuck, and return to a dense book. The PDF is the primary reading experience. The companion explains passages, retrieves earlier definitions, offers bounded section orientation, and preserves questions beside a reading position. Desktop/laptop first. This specification supersedes the generated-lesson PoC; its data may remain for compatibility but its workflow is not the main UI.

## Superseded initial reader experience
- Local browser app with a small library of text PDFs. PDF bytes and extracted page text stay in local SQLite, never the public repository.
- Import with filename/title and optional author. Render original pages using PDF.js, selectable text, previous/next and direct page navigation, PDF outline when available, zoom, collapsible navigation.
- Persist page, normalized scroll position, zoom, explicit spoiler boundary and editable stopping note per document. Reopen the last book. Navigating does not advance the spoiler boundary.
- Capture selected passage text, page and normalized rectangles. A region-selection mode captures a bounded page image for math with unreliable extraction. Preview context before asking.
- Compact/wide, collapsible companion panel with natural questions and explain/define/missing-step shortcuts. History attached to document/location. Mark questions unresolved/resolved and keep useful answers.
- Simple local lexical retrieval restricted to allowed pages. Answers have navigable citations validated against supplied context. State insufficient context; distinguish source evidence from supplementary explanation. Valid citations do not guarantee factual correctness.
- Orientation uses explicit page ranges and outline boundaries when available: purpose, prerequisites, what to watch for. No later-page evidence/history is sent beyond the boundary. Prompts also prohibit spoilers from model prior knowledge, though this is not a guarantee.
- Resume shows saved position, editable note and actual recent/unresolved questions. Do not infer mastery or understanding.
- Reading/import need no API key. Clearly labeled deterministic demo provider for development; real DeepSeek adapter (default when configured) and optional OpenAI Responses adapter configurable server-side. Missing credentials produce an actionable state, never simulated live answers.
- Live requests to the selected provider send bounded passages and optional selected image, not the full PDF/chapter. Disclose this at send. Do not make live calls with copyrighted user content during development without authorization.

## Initial boundaries
Text PDFs, maximum 25 MiB and 2,000 pages. Reject malformed/empty/password-protected files usefully. Regions supplement selection, not full-document OCR. No EPUB, OCR, quizzes, flashcards, grading, scheduling, authentication, deployment or cross-device sync. Local-first is not an offline PWA promise.

## Architecture
Keep one Bun package, Vite/React, Hono and SQLite repositories. Use PDF.js directly with a local worker. Browser adapters handle rendering/extraction. Do not execute PDF scripts or attachments. SHA-256 byte hash identifies documents. Anchors are physical one-based page plus optional normalized rectangles; printed labels are supplementary.
- src/app/reader/: library, PDF adapter, reader and companion UI.
- src/shared/reader.ts: serializable contracts/validation.
- src/domain/: portable bounded context/retrieval rules.
- src/server/api/: HTTP routes with bounded bodies and cross-origin mutation protection.
- src/server/db/: PDF/page/state/conversation repositories and isolated test databases.
- src/server/ai/: provider contracts, adapters, prompts and validated structured output. No browser keys or secret logging.
PDF migrations are additive; preserve old data. Parameterized SQL and strict validation. Model/source text is untrusted. Validate output and citation provenance before persistence; document identity and context boundary apply to history too.

## Acceptance and verification
1. Import synthetic PDF; render/select prose; navigate/zoom; reload/restart restores document/page/scroll/zoom.
2. Select math region, preview image and retain page anchor; selection works after zoom.
3. Ask with demo provider; persist/reopen history; citation navigates. Provider/network failures preserve questions for retry.
4. Definition lookup returns bounded evidence or honest empty result. Unit tests prove later pages/history excluded.
5. Save/edit stopping note; mark question unresolved; reopen surfaces it without mastery labels.
6. Orientation for explicit bounded range; invalid ranges/output/citations rejected.
7. Stubbed live HTTP adapter tests cover text/image input, missing key, errors and malformed output. Report live tests separately.
Run bun run typecheck, bun run build, bun run lint, bun run security:check, bun test and bun run test:e2e. Preserve db:migrate and explicit db:studio placeholder. Browser flow covers PDF import/selection/demo answer/citation/note/history/resume. Synthetic original fixtures only. Record feature video or exact blocker.

## Delivery
Branch codex/pdf-reading-companion. GitHub is the only issue queue. Sequential slices: reader/persistence; companion/retrieval/provider; orientation/resume; browser verification/hardening. Parent owns planning, integration, code/security reviews and documentation. User requires one implementation subagent at a time, gpt-5.6-luna xhigh. Open review PR; do not merge main.

## September 6 v1 delivery clarification
User authorized DeepSeek API use and loading their local Axler PDF. Store the key only in ignored local .env with restrictive permissions. Use bounded passage requests for live verification; no full chapter/PDF transmission. Load Axler into the private default local database and leave the app runnable for hands-on use. PR screenshots remain synthetic. Prioritize the complete reading/question/resume flow over optional refinements.

## Desktop usability follow-up
The reader omits the redundant app-wide masthead and keeps import in the library. Resolve named and direct PDF outline destinations, and support left/right and Page Up/Page Down navigation outside editing controls. Explain/define/missing-step shortcuts prepare a usable question. A blocked context request must identify its boundary and offer an explicit allow-through-page action; never misreport it as a provider failure or claim an unsaved question was persisted.

## Current companion: simple chat with book memory
This section supersedes the modes, keep/resolve cards, orientation form and hard spoiler-boundary controls above, following the user's explicit simplification request. Preserve the PDF reader and saved position.

- One plain chronological chat per book, one composer, Send/Enter (Shift+Enter newline), restrained typography and minimal neutral styling. The transcript scrolls independently with the composer visible. No mode, provider, keep/resolve or boundary controls in the chat. Provider is a local Codex App Server process authenticated through the installed Codex ChatGPT login. Demo is explicit test configuration only; unavailable runtime/login produces actionable errors.
- Selected text/region is a compact removable attachment. Reuse the existing PDF.js reader and repositories. Keep useful page references navigable.
- One small persistent, editable book memory note, behind a Memory control. Reuse stoppingNote storage as this memory, preserving existing notes. Include it in chat context. This v1 uses explicit reader-edited memory, not inferred learner profiles or an additional memory service. Normal saved chat history supplies conversational continuity.
- Model tools: get_reader_position (book title/author, physical page, outline section if available and memory), search_book (grep-like literal case-insensitive search over extracted text, bounded snippets/page numbers), read_pages (small bounded page passages). Tools are scoped server-side to the active book; never accept a filesystem path, shell command or arbitrary book identifier from the model.
- Search may cross-reference the entire active PDF, superseding the hard page boundary in the new chat path. Tell the model the current position and to avoid unsolicited later plot revelations. Only bounded retrieved excerpts, recent chat, memory and optional attachment are sent; no bulk PDF upload.
- Use Codex App Server over local stdio, with one durable resumable thread per book. Codex owns conversation context and the agent loop. Mneme implements validated book-scoped dynamic tools and enforces per-turn tool/context budgets. Plain final text with a visible pending status; evidence-backed page references. Keep runtime access isolated from the development repo: no shell/file writes, unrelated plugins or app tools. Pin/verify the local experimental protocol against installed Codex. Store book-to-thread mapping in SQLite and preserve existing notes/history. The app retains exact reader state and explicit memory notes; native Codex memory is optional supplementary recall, not required for v1.
- Reuse existing conversation persistence where practical and preserve prior records. Keep legacy endpoints functional if needed; do not build a parallel framework. No new dependency unless it removes substantial complexity.
- Verify multi-turn memory/history, reader-position tool, search/read cross-references, malformed/unknown tools, cross-book isolation and bounds, provider failure/retry, native chat keyboard behavior and reload persistence. Run existing checks and a synthetic browser/live-tool smoke test. Refresh PR screenshots to reflect the simplified UI.

## September 7 implementation approval
User approved the Codex runtime approach. Reuse the current ChatGPT login without copying credentials into app storage. Keep DeepSeek as a future provider option pending verified protocol compatibility; do not change the user global Codex configuration or migrate credentials.
