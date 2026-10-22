import { Readable } from "node:stream";
import { Worker } from "node:worker_threads";
import { parse as createCsvParser } from "csv-parse";
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
const PDF_WORKER_TIMEOUT_MS = 15_000;
const PDF_WORKER_RESOURCE_LIMITS = Object.freeze({
  maxOldGenerationSizeMb: 128,
  maxYoungGenerationSizeMb: 32,
  stackSizeMb: 4,
});

const failure = (code: Extract<KnowledgeDocumentExtractionResult, { kind: "failure" }>["code"]): KnowledgeDocumentExtractionResult =>
  Object.freeze({ kind: "failure", code });

function isSafeCell(value: string): boolean {
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value);
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
    return new Promise((resolve) => {
      let settled = false;
      const worker = new Worker(new URL("./pdf-text-worker.js", import.meta.url), {
        workerData: { bytes: bytes.slice() },
        resourceLimits: PDF_WORKER_RESOURCE_LIMITS,
      });
      const timer = setTimeout(() => finish(failure("PROCESSING_LIMIT"), true), PDF_WORKER_TIMEOUT_MS);
      const finish = (result: KnowledgeDocumentExtractionResult, terminate = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (terminate) void worker.terminate();
        resolve(result);
      };
      worker.once("message", (result: unknown) => {
        if (typeof result !== "object" || result === null || !("kind" in result)) {
          finish(failure("MALFORMED_FILE"), true);
          return;
        }
        finish(result as KnowledgeDocumentExtractionResult);
      });
      worker.once("error", () => finish(failure("PROCESSING_LIMIT")));
      worker.once("exit", () => {
        if (!settled) finish(failure("PROCESSING_LIMIT"));
      });
    });
  }
}
