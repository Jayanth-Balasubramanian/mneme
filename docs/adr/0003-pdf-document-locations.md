# ADR 0003: Local PDF identity and page locations

Status: Accepted for the desktop reader rework, 2026-09-05.

The companion needs to return to selected passages and cite earlier definitions. The prior Markdown paragraph anchors depend on transformed source text and cannot locate selections on rendered PDF pages.

Identify a PDF by the SHA-256 hash of its bytes. Store one-based physical page numbers and optional normalized rectangles for selections. Preserve printed page labels separately when available. Store PDF bytes, extracted page text and reading state locally in SQLite for this single-machine PoC. PDF rendering and extraction happen in the browser through PDF.js with a bundled worker.

This makes repeated imports recognizable, survives zoom changes, and keeps references tied to the exact edition/file. It does not align annotations across revised PDF files, and physical page numbers may differ from printed numbers. Local blob storage keeps backup and persistence simple at the cost of a larger SQLite file. EPUB will need another location adapter; do not pretend PDF rectangles are a universal book locator.

Reading position is independent of the maximum page permitted in companion context. Advancing through the reader must not expand retrieval scope silently.

Implementation references: [PDF.js examples](https://mozilla.github.io/pdf.js/examples/), [OpenAI structured output](https://developers.openai.com/api/docs/guides/structured-outputs), [OpenAI image input](https://developers.openai.com/api/docs/guides/images-vision). Structured output validates shape; page citation checks validate supplied locations, not semantic fidelity.
