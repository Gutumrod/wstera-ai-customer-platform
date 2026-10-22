import assert from "node:assert/strict";
import test from "node:test";
import type { KnowledgeObjectStoragePort } from "../adapters/storage/supabase/private-knowledge-storage.js";
import type { KnowledgeIntakeAuditPort, KnowledgeQuarantineRecord } from "../contracts/data/knowledge-intake.js";
import type { KnowledgeDocumentExtractorPort, KnowledgeRepositoryPort } from "../contracts/data/knowledge.js";
import { createTrustedWorkspace } from "../modules/tenancy/workspace.js";
import { InMemoryKnowledgeRepository } from "../modules/knowledge/testing/in-memory-repository.js";
import { retrieveKnowledge } from "../modules/knowledge/index.js";
import { ingestKnowledgeVersion, KnowledgeIntakeError } from "./knowledge-intake.js";

const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
const shopB = createTrustedWorkspace({ workspaceId: "shop-b", connectionId: "web-b", channel: "web" });

function dependencies(repository: KnowledgeRepositoryPort = new InMemoryKnowledgeRepository()) {
  const objects = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const quarantineRecords: KnowledgeQuarantineRecord[] = [];
  const originalReferences = new Map<string, string>();
  const storage: KnowledgeObjectStoragePort = {
    async putOriginal(workspace, identity, bytes) {
      const path = `${workspace.workspaceId}/${identity.sourceId}/${identity.versionId}/${identity.filename}`;
      const existed = objects.has(path);
      const previous = objects.get(path);
      if (previous && (previous.byteLength !== bytes.byteLength || previous.some((value, index) => value !== bytes[index]))) {
        throw new Error("KNOWLEDGE_OBJECT_CONFLICT");
      }
      objects.set(path, bytes.slice());
      return Object.freeze({ path, created: !existed });
    },
    async removeOriginal(_workspace, path) { removed.push(path); objects.delete(path); },
  };
  const extractor: KnowledgeDocumentExtractorPort = {
    async extract() {
      return Object.freeze({ kind: "success", segments: Object.freeze([
        Object.freeze({ text: "คืนสินค้าได้ภายใน 7 วัน", locator: Object.freeze({ kind: "page" as const, page: 1 }) }),
      ]) });
    },
  };
  const intakeAudit: KnowledgeIntakeAuditPort = {
    async recordOriginal(workspace, input) {
      const key = workspace.workspaceId + "/" + input.sourceId + "/" + input.versionId;
      const existing = originalReferences.get(key);
      if (existing && existing !== input.objectPath) throw new Error("KNOWLEDGE_ORIGINAL_REFERENCE_CONFLICT");
      originalReferences.set(key, input.objectPath);
    },
    async quarantine(workspace, input) {
      const record: KnowledgeQuarantineRecord = Object.freeze({ ...input, workspaceId: workspace.workspaceId, createdAt: new Date().toISOString() });
      quarantineRecords.push(record);
      return record;
    },
    async listQuarantine(workspace) {
      return Object.freeze(quarantineRecords.filter((record) => record.workspaceId === workspace.workspaceId));
    },
  };
  return { repository, storage, extractor, intakeAudit, objects, removed, quarantineRecords, originalReferences };
}

const baseInput = (workspace = shopA, idempotencyKey = "synthetic-request-0001") => ({
  workspace,
  userId: "synthetic-staff",
  idempotencyKey,
  title: "นโยบายคืนสินค้า",
  kind: "faq" as const,
  content: "คืนสินค้าได้ภายใน 7 วันนับจากวันที่ได้รับสินค้า",
});

test("knowledge intake is workspace-scoped, idempotent, and exposes citation-ready indexed knowledge", async () => {
  const deps = dependencies();
  const first = await ingestKnowledgeVersion(deps, baseInput());
  assert.equal(first.status, "indexed");
  assert.equal(first.chunks.length, 1);

  const retry = await ingestKnowledgeVersion(deps, baseInput());
  assert.equal(retry.versionId, first.versionId);
  assert.equal((await deps.repository.listSources(shopB)).length, 0);

  await deps.repository.approveVersion(shopA, first.sourceId, first.versionId, { approvedBy: "synthetic-owner" });
  const result = await retrieveKnowledge(deps.repository, { workspace: shopA, query: "คืนสินค้าได้กี่วัน", limit: 3 });
  assert.equal(result.kind, "evidence");
  if (result.kind === "evidence") {
    assert.equal(result.hits[0]?.citation.workspaceId, "shop-a");
    assert.equal(result.hits[0]?.citation.sourceVersionId, first.versionId);
    assert.deepEqual(result.hits[0]?.citation.locator, {
      kind: "span", chunkIndex: 0, start: 0, end: first.content.length,
    });
  }
});

test("reusing an idempotency key with different knowledge fails closed", async () => {
  const deps = dependencies();
  await ingestKnowledgeVersion(deps, baseInput());
  await assert.rejects(
    ingestKnowledgeVersion(deps, { ...baseInput(), content: "คืนสินค้าไม่ได้" }),
    (error: unknown) => error instanceof KnowledgeIntakeError && error.code === "VERSION_CONFLICT" && error.status === 409,
  );
});

test("bounded document intake stores the original and keeps exact page citations", async () => {
  const deps = dependencies();
  const result = await ingestKnowledgeVersion(deps, {
    ...baseInput(),
    idempotencyKey: "synthetic-pdf-request-0001",
    kind: "pdf",
    content: undefined,
    bytes: new Uint8Array([37, 80, 68, 70]),
    filename: "terms.pdf",
    contentType: "application/pdf",
  });
  assert.equal(result.status, "indexed");
  assert.equal(result.chunks[0]?.locator.kind, "page");
  assert.equal(deps.objects.size, 1);
  assert.equal(deps.originalReferences.size, 1);
});

test("database failure before version persistence does not create an orphan original", async () => {
  const brokenRepository = {
    ...new InMemoryKnowledgeRepository(),
    async createSource() { throw new Error("synthetic database failure"); },
  } as unknown as KnowledgeRepositoryPort;
  const deps = dependencies(brokenRepository);
  await assert.rejects(ingestKnowledgeVersion(deps, {
    ...baseInput(), idempotencyKey: "synthetic-pdf-request-0002", kind: "pdf", content: undefined,
    bytes: new Uint8Array([1, 2, 3]), filename: "terms.pdf", contentType: "application/pdf",
  }), (error: unknown) => error instanceof KnowledgeIntakeError && error.status === 500);
  assert.equal(deps.objects.size, 0);
  assert.equal(deps.removed.length, 0);
});

test("document retry with a different display filename reuses one immutable object path", async () => {
  const deps = dependencies();
  const input = {
    ...baseInput(), idempotencyKey: "synthetic-pdf-idempotent-01", kind: "pdf" as const, content: undefined,
    bytes: new Uint8Array([37, 80, 68, 70]), filename: "terms.pdf", contentType: "application/pdf",
  };
  const first = await ingestKnowledgeVersion(deps, input);
  const retry = await ingestKnowledgeVersion(deps, { ...input, filename: "thai ชื่อไฟล์.pdf" });
  assert.equal(retry.versionId, first.versionId);
  assert.equal(deps.objects.size, 1);
  assert.equal(deps.originalReferences.size, 1);
  assert.ok([...deps.objects.keys()][0]?.endsWith("/" + first.versionId + ".pdf"));
});

test("unsupported and oversized uploads are rejected before storage", async () => {
  const deps = dependencies();
  await assert.rejects(ingestKnowledgeVersion(deps, {
    ...baseInput(), kind: "pdf", content: undefined, bytes: new Uint8Array([1]),
    filename: "terms.pdf", contentType: "text/plain",
  }), (error: unknown) => error instanceof KnowledgeIntakeError && error.code === "UNSUPPORTED_FORMAT");
  await assert.rejects(ingestKnowledgeVersion(deps, {
    ...baseInput(), kind: "pdf", content: undefined, bytes: new Uint8Array(5 * 1024 * 1024 + 1),
    filename: "large.pdf", contentType: "application/pdf",
  }), (error: unknown) => error instanceof KnowledgeIntakeError && error.code === "FILE_TOO_LARGE");
  assert.equal(deps.objects.size, 0);
  assert.equal(deps.quarantineRecords.length, 2);
});

test("malformed documents are retained in workspace-scoped quarantine and never become retrievable", async () => {
  const deps = dependencies();
  const brokenExtractor: KnowledgeDocumentExtractorPort = {
    async extract() { return Object.freeze({ kind: "failure", code: "MALFORMED_FILE" }); },
  };
  await assert.rejects(ingestKnowledgeVersion({ ...deps, extractor: brokenExtractor }, {
    ...baseInput(), idempotencyKey: "synthetic-bad-pdf-request", kind: "pdf", content: undefined,
    bytes: new Uint8Array([37, 80, 68, 70]), filename: "broken.pdf", contentType: "application/pdf",
  }), (error: unknown) => error instanceof KnowledgeIntakeError && error.code === "MALFORMED_FILE");
  assert.equal(deps.objects.size, 1);
  assert.equal(deps.quarantineRecords.length, 1);
  assert.equal((await deps.repository.listSources(shopA)).length, 0);
  assert.equal((await deps.intakeAudit.listQuarantine(shopB)).length, 0);
  const result = await retrieveKnowledge(deps.repository, { workspace: shopA, query: "broken pdf", limit: 5 });
  assert.equal(result.kind, "no_answer");
});
