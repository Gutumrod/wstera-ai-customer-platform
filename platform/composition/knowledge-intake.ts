import { createHash } from "node:crypto";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import type { KnowledgeIntakeAuditPort } from "../contracts/data/knowledge-intake.js";
import type { KnowledgeRepositoryPort, KnowledgeSourceKind, KnowledgeVersion } from "../contracts/data/knowledge.js";
import { KnowledgeError, createFaqVersion, prepareKnowledgeDocumentVersion } from "../modules/knowledge/index.js";
import type { KnowledgeDocumentExtractorPort } from "../contracts/data/knowledge.js";
import type { KnowledgeObjectStoragePort } from "../contracts/data/knowledge-storage.js";

export class KnowledgeIntakeError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

export type KnowledgeIntakeInput = Readonly<{
  workspace: TrustedWorkspaceContext;
  userId: string;
  idempotencyKey: string;
  title: string;
  kind: KnowledgeSourceKind;
  content?: string;
  bytes?: Uint8Array;
  filename?: string;
  contentType?: string;
}>;

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function safeOriginalFilename(filename: string, kind: "pdf" | "csv"): string {
  const expected = kind === "pdf" ? ".pdf" : ".csv";
  const base = filename.normalize("NFKC").split(/[\\/]/u).at(-1)?.trim() ?? "";
  if (base.length === 0 || base.length > 128 || !base.toLocaleLowerCase("en-US").endsWith(expected)
    || /[\u0000-\u001F\u007F]/u.test(base)) throw new KnowledgeIntakeError("UNSUPPORTED_FORMAT", 415);
  const sanitized = base.replace(/[^A-Za-z0-9._-]/gu, "_");
  const safe = /^[A-Za-z0-9]/u.test(sanitized) ? sanitized : "upload" + sanitized;
  return safe.length <= 128 ? safe : safe.slice(0, 128 - expected.length) + expected;
}

export async function ingestKnowledgeVersion(
  dependencies: Readonly<{
    repository: KnowledgeRepositoryPort;
    extractor: KnowledgeDocumentExtractorPort;
    storage: KnowledgeObjectStoragePort;
    intakeAudit: KnowledgeIntakeAuditPort;
  }>,
  input: KnowledgeIntakeInput,
): Promise<KnowledgeVersion> {
  if (!/^[A-Za-z0-9_-]{12,128}$/u.test(input.idempotencyKey)) throw new KnowledgeIntakeError("IDEMPOTENCY_KEY_REQUIRED", 400);
  if (typeof input.title !== "string" || input.title.trim().length === 0 || input.title.length > 200) {
    throw new KnowledgeIntakeError("INVALID_KNOWLEDGE_INPUT", 400);
  }

  const sourceId = `src_${digest(`${input.workspace.workspaceId}:${input.idempotencyKey}`).slice(0, 32)}`;
  const versionId = `ver_${digest(input.idempotencyKey).slice(0, 32)}`;
  let original: Readonly<{ path: string; created: boolean }> | undefined;
  let versionPersisted = false;

  const quarantine = async (input: KnowledgeIntakeInput, code: string, status: number): Promise<never> => {
    if (input.kind !== "pdf" && input.kind !== "csv") throw new KnowledgeIntakeError(code, status);
    const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array();
    const attemptId = `qat_${digest(`${input.workspace.workspaceId}:${input.idempotencyKey}`).slice(0, 32)}`;
    const requestHash = digest(bytes);
    let quarantineObject: Readonly<{ path: string; created: boolean }> | undefined;
    const filename = input.filename ? (() => {
      try { return safeOriginalFilename(input.filename!, input.kind as "pdf" | "csv"); } catch { return undefined; }
    })() : undefined;
    const allowedMime = input.kind === "pdf" ? input.contentType === "application/pdf"
      : ["text/csv", "text/plain", "application/vnd.ms-excel"].includes(input.contentType ?? "");
    try {
      if (filename && allowedMime && bytes.byteLength > 0 && bytes.byteLength <= 5 * 1024 * 1024) {
        quarantineObject = await dependencies.storage.putOriginal(input.workspace, {
          sourceId: "quarantine",
          versionId: attemptId,
          filename: attemptId + (input.kind === "pdf" ? ".pdf" : ".csv"),
        }, bytes, input.contentType!);
      }
      await dependencies.intakeAudit.quarantine(input.workspace, {
        attemptId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        kind: input.kind,
        title: input.title.trim(),
        ...(filename ? { filename } : {}),
        ...(input.contentType ? { contentType: input.contentType } : {}),
        byteSize: bytes.byteLength,
        ...(quarantineObject ? { objectPath: quarantineObject.path } : {}),
        failureCode: code,
      });
    } catch (error: unknown) {
      if (quarantineObject?.created) {
        try { await dependencies.storage.removeOriginal(input.workspace, quarantineObject.path); } catch { /* fail closed below */ }
      }
      if (errorMessage(error)?.includes("CONFLICT")) throw new KnowledgeIntakeError("IDEMPOTENCY_CONFLICT", 409);
      throw new KnowledgeIntakeError("QUARANTINE_RECORD_FAILED", 500);
    }
    throw new KnowledgeIntakeError(code, status);
  };

  try {
    let version: KnowledgeVersion;
    if (input.kind === "faq") {
      if (typeof input.content !== "string" || input.bytes !== undefined) throw new KnowledgeIntakeError("INVALID_KNOWLEDGE_INPUT", 400);
      version = createFaqVersion({
        workspace: input.workspace,
        sourceId,
        versionId,
        title: input.title,
        content: input.content,
      });
    } else {
      if (!(input.bytes instanceof Uint8Array) || !input.filename || !input.contentType) {
        throw new KnowledgeIntakeError("INVALID_KNOWLEDGE_INPUT", 400);
      }
      const filename = safeOriginalFilename(input.filename, input.kind);
      const expectedMime = input.kind === "pdf" ? "application/pdf" : ["text/csv", "text/plain", "application/vnd.ms-excel"];
      if (Array.isArray(expectedMime) ? !expectedMime.includes(input.contentType) : input.contentType !== expectedMime) {
        return await quarantine(input, "UNSUPPORTED_FORMAT", 415);
      }
      if (input.bytes.byteLength === 0 || input.bytes.byteLength > 5 * 1024 * 1024) {
        return await quarantine(input, "FILE_TOO_LARGE", 413);
      }

      const prepared = await prepareKnowledgeDocumentVersion(dependencies.extractor, {
        workspace: input.workspace,
        sourceId,
        versionId,
        title: input.title,
        kind: input.kind,
        bytes: input.bytes,
      });
      if (prepared.kind === "failure") return await quarantine(input, prepared.code, 422);
      version = prepared.version;
    }

    await dependencies.repository.createSource(input.workspace, {
      sourceId,
      title: input.title.trim(),
      kind: input.kind,
    });
    const created = await dependencies.repository.createVersion(input.workspace, version);
    if (input.bytes && input.filename && (input.kind === "pdf" || input.kind === "csv")) {
      original = await dependencies.storage.putOriginal(input.workspace, {
        sourceId,
        versionId,
        filename: versionId + (input.kind === "pdf" ? ".pdf" : ".csv"),
      }, input.bytes, input.contentType!);
      await dependencies.intakeAudit.recordOriginal(input.workspace, {
        sourceId,
        versionId,
        objectPath: original.path,
        filename: versionId + (input.kind === "pdf" ? ".pdf" : ".csv"),
        contentType: input.contentType!,
        byteSize: input.bytes.byteLength,
      });
    }
    versionPersisted = true;
    if (["indexed", "approved", "revoked"].includes(created.status)) return created;

    let current = created;
    if (current.status === "failed") current = await dependencies.repository.transitionVersion(input.workspace, sourceId, versionId, "validating");
    if (current.status === "uploaded") current = await dependencies.repository.transitionVersion(input.workspace, sourceId, versionId, "validating");
    if (current.status === "validating") current = await dependencies.repository.transitionVersion(input.workspace, sourceId, versionId, "extracting");
    if (current.status === "extracting") current = await dependencies.repository.transitionVersion(input.workspace, sourceId, versionId, "indexed");
    return current;
  } catch (error: unknown) {
    if (original?.created && !versionPersisted) {
      try {
        await dependencies.storage.removeOriginal(input.workspace, original.path);
      } catch {
        throw new KnowledgeIntakeError("UPLOAD_ROLLBACK_FAILED", 500);
      }
    }
    if (error instanceof KnowledgeIntakeError) throw error;
    if (error instanceof KnowledgeError) {
      const status = error.code === "VERSION_CONFLICT" || error.code === "SOURCE_CONFLICT" ? 409 : 400;
      throw new KnowledgeIntakeError(error.code, status);
    }
    if (errorMessage(error)?.includes("CONFLICT")) throw new KnowledgeIntakeError("IDEMPOTENCY_CONFLICT", 409);
    throw new KnowledgeIntakeError("KNOWLEDGE_INGESTION_FAILED", 500);
  }
}
