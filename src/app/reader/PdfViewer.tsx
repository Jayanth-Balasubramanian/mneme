import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

import {
  isRenderCancellation,
  renderPdfPage,
} from "./pdfAdapter";
import {
  normalizedRectFromClientRect,
} from "../../shared/reader";
import type { NormalizedRect, ReaderSelection } from "../../shared/reader";

type PdfViewerProps = {
  document: PDFDocumentProxy | null;
  currentPage: number;
  zoom: number;
  regionMode: boolean;
  onSelection: (selection: ReaderSelection) => void;
  onPageText?: (text: string) => void;
  onScrollTopChange?: (scrollTop: number) => void;
  initialScrollTop?: number;
};

type DragState = { startX: number; startY: number; currentX: number; currentY: number };

function normalizedDragRect(drag: DragState, pageRect: DOMRect): NormalizedRect {
  const left = Math.min(drag.startX, drag.currentX);
  const right = Math.max(drag.startX, drag.currentX);
  const top = Math.min(drag.startY, drag.currentY);
  const bottom = Math.max(drag.startY, drag.currentY);
  return normalizedRectFromClientRect(
    { left, right, top, bottom },
    { left: pageRect.left, top: pageRect.top, width: pageRect.width, height: pageRect.height },
  );
}

export function PdfViewer({
  document,
  currentPage,
  zoom,
  regionMode,
  onSelection,
  onPageText,
  onScrollTopChange,
  initialScrollTop = 0,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerInstanceRef = useRef<{ cancel(): void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderedPage, setRenderedPage] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoreScrollTopRef = useRef(initialScrollTop);

  useEffect(() => {
    restoreScrollTopRef.current = initialScrollTop;
  }, [initialScrollTop]);

  useEffect(() => {
    let cancelled = false;
    let page: PDFPageProxy | undefined;
    renderTaskRef.current?.cancel();
    textLayerInstanceRef.current?.cancel();
    renderTaskRef.current = null;
    textLayerInstanceRef.current = null;
    setRenderedPage(null);
    setError(null);
    if (!document || !canvasRef.current || !textLayerRef.current) return;

    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    void (async () => {
      try {
        page = await document.getPage(currentPage);
        if (cancelled) return;
        const render = await renderPdfPage(page, canvas, textLayer, zoom, (task) => {
          renderTaskRef.current = task;
        });
        if (cancelled) {
          render.renderTask.cancel();
          render.textLayer.cancel();
          return;
        }
        textLayerInstanceRef.current = render.textLayer;
        if (scrollRef.current) {
          const maxScroll = scrollRef.current.scrollHeight - scrollRef.current.clientHeight;
          scrollRef.current.scrollTop = Math.max(0, Math.min(1, restoreScrollTopRef.current)) * Math.max(0, maxScroll);
        }
        setRenderedPage(currentPage);
        onPageText?.(render.textLayer.textContentItemsStr.join(" ").trim());
      } catch (renderError) {
        if (!cancelled && !isRenderCancellation(renderError)) {
          setError(renderError instanceof Error ? renderError.message : "Unable to render this page.");
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      textLayerInstanceRef.current?.cancel();
      renderTaskRef.current = null;
      textLayerInstanceRef.current = null;
      page?.cleanup();
    };
  }, [currentPage, document, onPageText, zoom]);

  function handleTextSelection(): void {
    if (regionMode || !surfaceRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.toString().trim().length === 0) return;
    const pageRect = surfaceRef.current.getBoundingClientRect();
    const rectangles = Array.from(selection.getRangeAt(0).getClientRects())
      .map((rect) => normalizedRectFromClientRect(rect, pageRect))
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (rectangles.length === 0) return;
    onSelection({ text: selection.toString().trim(), pageNumber: currentPage, rectangles });
  }

  function pointerPosition(event: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } {
    return { x: event.clientX, y: event.clientY };
  }

  function startRegion(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!regionMode || !surfaceRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = pointerPosition(event);
    setDrag({ startX: position.x, startY: position.y, currentX: position.x, currentY: position.y });
  }

  function moveRegion(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!drag) return;
    const position = pointerPosition(event);
    setDrag((current) => current ? { ...current, currentX: position.x, currentY: position.y } : current);
  }

  function finishRegion(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!drag || !surfaceRef.current || !canvasRef.current) return;
    const pageRect = surfaceRef.current.getBoundingClientRect();
    const rectangle = normalizedDragRect(drag, pageRect);
    setDrag(null);
    if (rectangle.width < 0.01 || rectangle.height < 0.01) return;
    const sourceCanvas = canvasRef.current;
    const maxDimension = 1600;
    const cropWidth = Math.max(1, Math.min(maxDimension, Math.round(rectangle.width * sourceCanvas.width)));
    const cropHeight = Math.max(1, Math.min(1200, Math.round(rectangle.height * sourceCanvas.height)));
    const crop = window.document.createElement("canvas");
    crop.width = cropWidth;
    crop.height = cropHeight;
    const cropContext = crop.getContext("2d");
    if (!cropContext) return;
    cropContext.drawImage(
      sourceCanvas,
      Math.round(rectangle.x * sourceCanvas.width),
      Math.round(rectangle.y * sourceCanvas.height),
      Math.round(rectangle.width * sourceCanvas.width),
      Math.round(rectangle.height * sourceCanvas.height),
      0,
      0,
      cropWidth,
      cropHeight,
    );
    onSelection({
      text: "",
      pageNumber: currentPage,
      rectangles: [rectangle],
      regionImageDataUrl: crop.toDataURL("image/png"),
    });
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleScroll(event: React.UIEvent<HTMLDivElement>): void {
    const target = event.currentTarget;
    const max = target.scrollHeight - target.clientHeight;
    onScrollTopChange?.(max > 0 ? target.scrollTop / max : 0);
  }

  return (
    <div className="pdf-viewer" data-testid="pdf-viewer">
      <div ref={scrollRef} className="pdf-viewer__scroll" onScroll={handleScroll}>
        <div
          ref={surfaceRef}
          className={`pdf-page-surface${regionMode ? " pdf-page-surface--region" : ""}`}
          onMouseUp={handleTextSelection}
          onPointerDown={startRegion}
          onPointerMove={moveRegion}
          onPointerUp={finishRegion}
        >
          <canvas ref={canvasRef} className="pdf-page-canvas" aria-label={`Page ${currentPage}`} />
          <div ref={textLayerRef} className="textLayer" aria-label="Selectable page text" />
          {drag && surfaceRef.current ? (
            <div
              className="pdf-region-selection"
              style={{
                left: `${normalizedDragRect(drag, surfaceRef.current.getBoundingClientRect()).x * 100}%`,
                top: `${normalizedDragRect(drag, surfaceRef.current.getBoundingClientRect()).y * 100}%`,
                width: `${normalizedDragRect(drag, surfaceRef.current.getBoundingClientRect()).width * 100}%`,
                height: `${normalizedDragRect(drag, surfaceRef.current.getBoundingClientRect()).height * 100}%`,
              }}
            />
          ) : null}
        </div>
        {error ? <p className="pdf-viewer__error" role="alert">{error}</p> : null}
        {renderedPage === null && !error ? <p className="pdf-viewer__loading">Rendering page {currentPage}…</p> : null}
      </div>
    </div>
  );
}
