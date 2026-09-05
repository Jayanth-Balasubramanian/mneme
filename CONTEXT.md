# Domain language

- Book/document: local PDF, identified by SHA-256 bytes, with title and optional author.
- Page: one-based physical PDF page; printed labels may differ.
- Passage: selected text on a page with normalized rectangles when available.
- Region: selected page rectangle captured as an image for mathematical notation.
- Reading position: document/page/scroll/zoom; not proof of reading or understanding.
- Context boundary: reader-controlled last page allowed in companion evidence/history; never advances automatically.
- Companion: explanations, definition lookup, missing steps and bounded orientation attached to the PDF.
- Citation: navigable page reference from context supplied to the model; not a factual correctness guarantee.
- Stopping note: editable reader note carried forward on reopening.
- Unresolved question: explicitly open question, not inferred weakness.
- Orientation: optional short purpose/prerequisite/observation guidance for a bounded section.

Legacy lesson/approval/checkpoint data remains compatible but does not drive the main UI.
