import { Readable } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as createCsvParser } from "csv-parse";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  KnowledgeDocumentExtractionResult,
  KnowledgeDocumentExtractorPort,
  KnowledgeExtractedSegment,
} from "../../contracts/data/knowledge.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const MAX_CSV_DATA_ROWS = 5_000;
const MAX_CSV_COLUMNS = 100;
const MAX_CSV_RECORD_CHARS = 16_384;
const MAX_EXTRACTED_CHARS = 100_000;
const PDFJS_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs")))));
const PDFJS_STANDARD_FONTS = `${join(PDFJS_ROOT, "standard_fonts").replaceAll("\\", "/")}/`;
const PDFJS_CMAPS = `${join(PDFJS_ROOT, "cmaps").replaceAll("\\", "/")}/`;

const failure = (code: Extract<KnowledgeDocumentExtractionResult, { kind: "failure" }>["code"]): KnowledgeDocumentExtractionResult =>
  Object.freeze({ kind: "failure", code });

function isSafeCell(value: string): boolean {
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
}

function normalizePdfPageText(items: readonly unknown[]): string {
  const parts: string[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null || !("str" in item) || typeof item.str !== "string") continue;
    if (item.str.length > 0) parts.push(item.str);
    if ("hasEOL" in item && item.hasEOL === true) parts.push("\n");
  }
  return parts.join(" ").replace(/[ \t]*\n[ \t]*/gu, "\n").replace(/[ \t]{2,}/gu, " ").trim();
}

export class LocalKnowledgeDocumentExtractor implements KnowledgeDocumentExtractorPort {
  async extract(input: Readonly<{ kind: "pdf" | "csv"; bytes: Uint8Array }>): Promise<KnowledgeDocumentExtractionResult> {
    if (typeof input !== "object" || input === null) return failure("MALFORMED_FILE");
    if (input.kind !== "pdf" && input.kind !== "csv") return failure("UNSUPPORTED_FORMAT");
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) return failure("MALFORMED_FILE");
    if (input.bytes.byteLength > MAX_FILE_BYTES) return failure("FILE_TOO_LARGE");
    return input.kind === "pdf" ? this.extractPdf(input.bytes) : this.extractCsv(input.bytes);
  }

  private async extractCsv(bytes: Uint8Array): Promise<KnowledgeDocumentExtractionResult> {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return failure("INVALID_ENCODING");
    }

    const parser = Readable.from([text]).pipe(createCsvParser({
      bom: true,
      max_record_size: MAX_CSV_RECORD_CHARS,
      relax_column_count: false,
      skip_empty_lines: true,
      trim: true,
    }));
    const segments: KnowledgeExtractedSegment[] = [];
    let headers: string[] | undefined;
    let recordNumber = 0;
    let outputChars = 0;
    let tooManyRows = false;
    let tooManyColumns = false;
    let outputTooLarge = false;
    try {
      for await (const rawRecord of parser) {
        recordNumber += 1;
        const cells = rawRecord as string[];
        if (!headers) {
          headers = cells.map((header) => header.trim());
          if (headers.length === 0 || headers.some((header) => header.length === 0)) return failure("MALFORMED_FILE");
          if (headers.length > MAX_CSV_COLUMNS) {
            tooManyColumns = true;
            break;
          }
          const normalizedHeaders = headers.map((header) => header.normalize("NFKC").toLocaleLowerCase("en-US"));
          if (normalizedHeaders.some((header) => !isSafeCell(header)) || new Set(normalizedHeaders).size !== normalizedHeaders.length) {
            return failure("MALFORMED_FILE");
          }
          continue;
        }
        if (recordNumber - 1 > MAX_CSV_DATA_ROWS) {
          tooManyRows = true;
          break;
        }
        if (cells.length !== headers.length || cells.some((cell) => !isSafeCell(cell))) return failure("MALFORMED_FILE");
        const fields = cells.flatMap((cell, index) => cell.length > 0 ? [`${headers![index]}: ${cell}`] : []);
        if (fields.length === 0) continue;
        const segmentText = fields.join(" | ");
        if (outputChars + (segments.length > 0 ? 2 : 0) + segmentText.length > MAX_EXTRACTED_CHARS) {
          outputTooLarge = true;
          break;
        }
        outputChars += (segments.length > 0 ? 2 : 0) + segmentText.length;
        segments.push(Object.freeze({ text: segmentText, locator: Object.freeze({ kind: "row", row: recordNumber }) }));
      }
    } catch (error: unknown) {
      const code = (error as { code?: unknown } | null)?.code;
      return failure(code === "CSV_MAX_RECORD_SIZE" ? "RECORD_TOO_LARGE" : "MALFORMED_FILE");
    }
    if (tooManyColumns) return failure("TOO_MANY_COLUMNS");
    if (tooManyRows) return failure("TOO_MANY_ROWS");
    if (outputTooLarge) return failure("OUTPUT_TOO_LARGE");
    if (!headers || segments.length === 0) return failure("NO_TEXT_CONTENT");
    return Object.freeze({ kind: "success", segments: Object.freeze(segments) });
  }

  private async extractPdf(bytes: Uint8Array): Promise<KnowledgeDocumentExtractionResult> {
    const header = Buffer.from(bytes.subarray(0, Math.min(bytes.byteLength, 1_024))).includes("%PDF-");
    if (!header) return failure("MALFORMED_FILE");

    let loadingTask: ReturnType<typeof getDocument> | undefined;
    try {
      loadingTask = getDocument({
        data: bytes.slice(),
        cMapUrl: PDFJS_CMAPS,
        cMapPacked: true,
        standardFontDataUrl: PDFJS_STANDARD_FONTS,
        stopAtErrors: true,
      });
      const document = await loadingTask.promise;
      if (document.numPages > MAX_PDF_PAGES) return failure("TOO_MANY_PAGES");

      const segments: KnowledgeExtractedSegment[] = [];
      let outputChars = 0;
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        try {
          const textContent = await page.getTextContent();
          const pageText = normalizePdfPageText(textContent.items);
          if (!pageText) continue;
          if (outputChars + (segments.length > 0 ? 2 : 0) + pageText.length > MAX_EXTRACTED_CHARS) return failure("OUTPUT_TOO_LARGE");
          outputChars += (segments.length > 0 ? 2 : 0) + pageText.length;
          segments.push(Object.freeze({ text: pageText, locator: Object.freeze({ kind: "page", page: pageNumber }) }));
        } finally {
          page.cleanup();
        }
      }
      if (segments.length === 0) return failure("NO_TEXT_CONTENT");
      return Object.freeze({ kind: "success", segments: Object.freeze(segments) });
    } catch {
      return failure("MALFORMED_FILE");
    } finally {
      if (loadingTask) await loadingTask.destroy().catch(() => undefined);
    }
  }
}
