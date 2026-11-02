import assert from "node:assert/strict";
import test from "node:test";
import * as extractorModule from "./document-extractor.js";

const { LocalKnowledgeDocumentExtractor } = extractorModule;
const load = (extractorModule as { pdfWorkerLoad?: () => Readonly<{ active: number; queued: number }> }).pdfWorkerLoad;

test("PDF extraction caps workers and queue, refuses the overflow, then frees every slot", async () => {
  assert.equal(typeof load, "function", "pdfWorkerLoad must report the worker cap");
  const extractor = new LocalKnowledgeDocumentExtractor();
  const bytes = new TextEncoder().encode("%PDF-1.4 synthetic-not-a-real-document");
  const running = Array.from({ length: 12 }, () => extractor.extract({ kind: "pdf", bytes }));
  assert.deepEqual(load!(), { active: 2, queued: 8 });
  const results = await Promise.all(running);
  const codes = results.map((result) => result.kind === "failure" ? result.code : "success");
  assert.equal(codes.filter((value) => value === "EXTRACTION_BUSY").length, 2);
  assert.equal(codes.filter((value) => value === "MALFORMED_FILE").length, 10);
  for (let attempt = 0; attempt < 100 && load!().active > 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(load!(), { active: 0, queued: 0 });
});

test("CSV extraction spawns no worker and never waits on the PDF cap", async () => {
  const extractor = new LocalKnowledgeDocumentExtractor();
  const result = await extractor.extract({ kind: "csv", bytes: new TextEncoder().encode("q,a\nหนึ่ง,สอง\n") });
  assert.equal(result.kind, "success");
  assert.deepEqual(load?.(), { active: 0, queued: 0 });
});
