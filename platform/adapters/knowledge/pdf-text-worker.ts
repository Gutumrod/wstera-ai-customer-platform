import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  KnowledgeDocumentExtractionResult,
  KnowledgeExtractedSegment,
} from "../../contracts/data/knowledge.js";

const MAX_PDF_PAGES = 100;
const MAX_EXTRACTED_CHARS = 100_000;
const PDFJS_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs")))));
const PDFJS_STANDARD_FONTS = `${join(PDFJS_ROOT, "standard_fonts").replaceAll("\\", "/")}/`;
const PDFJS_CMAPS = `${join(PDFJS_ROOT, "cmaps").replaceAll("\\", "/")}/`;

type PageText = Readonly<{ kind: "success"; text: string }> | Readonly<{ kind: "too_large" }>;

function normalizePdfPageText(text: string): string {
  return text.replace(/[ \t]*\n[ \t]*/gu, "\n").replace(/[ \t]{2,}/gu, " ").trim();
}

/** Consume PDF.js text incrementally; cancel before retaining any content beyond the caller's budget. */
export async function consumePdfTextStream(stream: ReadableStream<unknown>, maxChars: number): Promise<PageText> {
  const reader = stream.getReader();
  let rawText = "";
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      const content = item.value as { items?: unknown } | null;
      if (typeof content !== "object" || content === null || !Array.isArray(content.items)) continue;
      for (const rawItem of content.items) {
        if (typeof rawItem !== "object" || rawItem === null || !("str" in rawItem)
          || typeof rawItem.str !== "string") continue;
        const separator = rawText.length === 0 ? "" : " ";
        const suffix = "hasEOL" in rawItem && rawItem.hasEOL === true ? "\n" : "";
        if (rawText.length + separator.length + rawItem.str.length + suffix.length > maxChars) {
          await reader.cancel("PDF_TEXT_LIMIT").catch(() => undefined);
          return Object.freeze({ kind: "too_large" });
        }
        rawText += separator + rawItem.str + suffix;
      }
    }
    const text = normalizePdfPageText(rawText);
    return text.length > maxChars
      ? Object.freeze({ kind: "too_large" })
      : Object.freeze({ kind: "success", text });
  } finally {
    reader.releaseLock();
  }
}

async function extractPdf(bytes: Uint8Array): Promise<KnowledgeDocumentExtractionResult> {
  let loadingTask: ReturnType<typeof getDocument> | undefined;
  try {
    loadingTask = getDocument({
      data: bytes,
      cMapUrl: PDFJS_CMAPS,
      cMapPacked: true,
      standardFontDataUrl: PDFJS_STANDARD_FONTS,
      stopAtErrors: true,
    });
    const document = await loadingTask.promise;
    if (document.numPages > MAX_PDF_PAGES) return Object.freeze({ kind: "failure", code: "TOO_MANY_PAGES" });

    const segments: KnowledgeExtractedSegment[] = [];
    let outputChars = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      try {
        const remaining = MAX_EXTRACTED_CHARS - outputChars - (segments.length > 0 ? 2 : 0);
        const pageText = await consumePdfTextStream(page.streamTextContent(), remaining);
        if (pageText.kind === "too_large") return Object.freeze({ kind: "failure", code: "OUTPUT_TOO_LARGE" });
        if (!pageText.text) continue;
        outputChars += (segments.length > 0 ? 2 : 0) + pageText.text.length;
        segments.push(Object.freeze({ text: pageText.text, locator: Object.freeze({ kind: "page", page: pageNumber }) }));
      } finally {
        page.cleanup();
      }
    }
    if (segments.length === 0) return Object.freeze({ kind: "failure", code: "NO_TEXT_CONTENT" });
    return Object.freeze({ kind: "success", segments: Object.freeze(segments) });
  } catch {
    return Object.freeze({ kind: "failure", code: "MALFORMED_FILE" });
  } finally {
    if (loadingTask) await loadingTask.destroy().catch(() => undefined);
  }
}

const port = parentPort;
if (port) {
  const bytes = (workerData as { bytes: Uint8Array }).bytes;
  void extractPdf(bytes).then((result) => port.postMessage(result));
}
