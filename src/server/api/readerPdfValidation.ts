import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { READER_MAX_PDF_PAGES } from "../../shared/reader";
import type { ReaderPdfValidator } from "./reader";

type RestrictedDocumentOptions = Parameters<typeof getDocument>[0] & {
  isEvalSupported: false;
};

/** Validate bytes in the local Bun runtime without permitting document URLs or scripts. */
export const validatePdfWithPdfJs: ReaderPdfValidator = async (bytes) => {
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
  const loadingTask = getDocument(options);
  try {
    const document = await loadingTask.promise;
    const pageCount = document.numPages;
    if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("empty_pdf");
    if (pageCount > READER_MAX_PDF_PAGES) throw new Error("too_many_pages");
    await document.getPage(1);
    return { pageCount };
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
};
