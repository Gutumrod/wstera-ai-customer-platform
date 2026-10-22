import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";
import { KnowledgeError } from "../../../contracts/data/knowledge.js";
import type {
  KnowledgeChunk,
  KnowledgeCitation,
  KnowledgeCitationLocator,
  KnowledgeRepositoryPort,
  KnowledgeSource,
  KnowledgeVersion,
  KnowledgeVersionDraft,
  KnowledgeVersionTransition,
} from "../../../contracts/data/knowledge.js";
import { canonicalizeKnowledgeVersionDraft } from "../../../modules/knowledge/index.js";

export type PostgresRow = Readonly<Record<string, unknown>>;
export type PostgresQueryResult<Row extends PostgresRow = PostgresRow> = Readonly<{ rows: readonly Row[] }>;

/** Minimal query surface compatible with a checked-out PostgreSQL client. */
export interface PostgresQueryPort {
  query<Row extends PostgresRow = PostgresRow>(sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<Row>>;
}

/** The host must pin one connection and commit/rollback the callback atomically. */
export interface PostgresDatabasePort {
  transaction<T>(operation: (query: PostgresQueryPort) => Promise<T>): Promise<T>;
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const transitionSources: Readonly<Record<KnowledgeVersionTransition, readonly KnowledgeVersion["status"][]>> = {
  validating: ["uploaded", "failed"],
  extracting: ["validating"],
  indexed: ["extracting"],
  quarantined: ["uploaded", "validating", "extracting", "indexed"],
  failed: ["uploaded", "validating", "extracting", "indexed"],
};

type VersionRow = PostgresRow & {
  workspace_id: string;
  source_id: string;
  version_id: string;
  kind: KnowledgeVersion["kind"];
  title: string;
  content: string;
  status: KnowledgeVersion["status"];
  created_at: Date | string;
  approved_at: Date | string | null;
  approved_by: string | null;
  revoked_at: Date | string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
};

type SourceRow = PostgresRow & {
  workspace_id: string;
  source_id: string;
  kind: KnowledgeSource["kind"];
  title: string;
  status: KnowledgeSource["status"];
  created_at: Date | string;
};

type ChunkRow = PostgresRow & {
  workspace_id: string;
  source_id: string;
  version_id: string;
  chunk_id: string;
  chunk_index: number;
  text: string;
  locator_kind: KnowledgeCitationLocator["kind"];
  locator_chunk_index: number;
  locator_position: number | null;
  start_offset: number;
  end_offset: number;
};

type RetrievableRow = PostgresRow & {
  workspace_id: string;
  source_id: string;
  source_kind: KnowledgeSource["kind"];
  source_title: string;
  source_status: KnowledgeSource["status"];
  source_created_at: Date | string;
  version_id: string;
  version_kind: KnowledgeVersion["kind"];
  version_title: string;
  content: string;
  version_status: KnowledgeVersion["status"];
  version_created_at: Date | string;
  approved_at: Date | string | null;
  approved_by: string | null;
  revoked_at: Date | string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  chunk_id: string;
  chunk_index: number;
  text: string;
  locator_kind: KnowledgeCitationLocator["kind"];
  locator_chunk_index: number;
  locator_position: number | null;
  start_offset: number;
  end_offset: number;
};

function asIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  return date.toISOString();
}

function asNullableIso(value: Date | string | null): string | undefined {
  return value === null ? undefined : asIso(value);
}

function mapSource(row: SourceRow): KnowledgeSource {
  return Object.freeze({
    workspaceId: row.workspace_id,
    sourceId: row.source_id,
    kind: row.kind,
    title: row.title,
    status: row.status,
    createdAt: asIso(row.created_at),
  });
}

function mapChunk(row: ChunkRow): KnowledgeChunk {
  let locator: KnowledgeCitationLocator;
  if (row.locator_kind === "page") {
    locator = Object.freeze({ kind: "page", page: row.locator_position!, chunkIndex: row.locator_chunk_index });
  } else if (row.locator_kind === "row") {
    locator = Object.freeze({ kind: "row", row: row.locator_position!, chunkIndex: row.locator_chunk_index });
  } else if (row.locator_kind === "span") {
    locator = Object.freeze({ kind: "span", chunkIndex: row.locator_chunk_index, start: row.start_offset, end: row.end_offset });
  } else {
    locator = Object.freeze({ kind: "chunk", chunkIndex: row.locator_chunk_index });
  }
  return Object.freeze({
    workspaceId: row.workspace_id,
    sourceId: row.source_id,
    versionId: row.version_id,
    chunkId: row.chunk_id,
    chunkIndex: row.chunk_index,
    text: row.text,
    locator,
    start: row.start_offset,
    end: row.end_offset,
  });
}

function mapVersion(row: VersionRow, chunks: readonly KnowledgeChunk[]): KnowledgeVersion {
  return Object.freeze({
    workspaceId: row.workspace_id,
    sourceId: row.source_id,
    versionId: row.version_id,
    kind: row.kind,
    title: row.title,
    content: row.content,
    status: row.status,
    chunks: Object.freeze([...chunks]),
    createdAt: asIso(row.created_at),
    ...(asNullableIso(row.approved_at) ? { approvedAt: asNullableIso(row.approved_at), approvedBy: row.approved_by! } : {}),
    ...(asNullableIso(row.revoked_at) ? {
      revokedAt: asNullableIso(row.revoked_at), revokedBy: row.revoked_by!, revocationReason: row.revocation_reason!,
    } : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotDataObject(value: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string" || !allowed.includes(key))) return null;
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor)) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function snapshotArray(value: unknown, maximum: number): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const keys = Reflect.ownKeys(value);
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum || keys.length !== length + 1 || !keys.includes("length")) return null;
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function snapshotSourceInput(value: unknown): Readonly<{
  sourceId: string;
  title: string;
  kind: KnowledgeSource["kind"];
}> {
  const input = snapshotDataObject(value, ["sourceId", "title", "kind"]);
  if (!input || Object.keys(input).length !== 3 || typeof input.sourceId !== "string" || !identifierPattern.test(input.sourceId)
    || typeof input.title !== "string" || input.title.trim().length === 0 || input.title.length > 200
    || !["faq", "pdf", "csv"].includes(String(input.kind))) {
    throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  }
  return Object.freeze({ sourceId: input.sourceId, title: input.title, kind: input.kind as KnowledgeSource["kind"] });
}

function locatorIdentity(locator: KnowledgeCitationLocator): string {
  if (locator.kind === "span") return `span:${locator.chunkIndex}:${locator.start}:${locator.end}`;
  if (locator.kind === "page") return `page:${locator.page}:${locator.chunkIndex ?? 0}`;
  if (locator.kind === "row") return `row:${locator.row}:${locator.chunkIndex ?? 0}`;
  return `chunk:${locator.chunkIndex}`;
}

function snapshotVersionDraft(workspace: TrustedWorkspaceContext, value: unknown): KnowledgeVersionDraft {
  const fields = snapshotDataObject(value, ["workspaceId", "sourceId", "versionId", "kind", "title", "content", "chunks", "createdAt", "status"]);
  if (!fields || (Object.keys(fields).length !== 8 && Object.keys(fields).length !== 9)
    || typeof fields.workspaceId !== "string" || fields.workspaceId !== workspace.workspaceId) {
    throw new KnowledgeError("CROSS_WORKSPACE_ACCESS_DENIED");
  }
  if (("status" in fields && fields.status !== "uploaded")
    || typeof fields.sourceId !== "string" || !identifierPattern.test(fields.sourceId)
    || typeof fields.versionId !== "string" || !identifierPattern.test(fields.versionId)
    || typeof fields.kind !== "string" || !["faq", "pdf", "csv"].includes(fields.kind)
    || typeof fields.title !== "string" || fields.title.trim().length === 0 || fields.title.length > 200
    || typeof fields.content !== "string" || fields.content.trim().length === 0 || fields.content.length > 100_000
    || typeof fields.createdAt !== "string" || !Number.isFinite(Date.parse(fields.createdAt))) {
    throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  }
  const rawChunks = snapshotArray(fields.chunks, 100_000);
  if (!rawChunks || rawChunks.length === 0) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  const chunks: KnowledgeChunk[] = [];
  let previousEnd = 0;
  let previousLocator = "";
  const draftBase = {
    workspaceId: fields.workspaceId,
    sourceId: fields.sourceId,
    versionId: fields.versionId,
    kind: fields.kind as KnowledgeVersionDraft["kind"],
    title: fields.title,
    content: fields.content,
    createdAt: fields.createdAt,
  };
  for (let index = 0; index < rawChunks.length; index += 1) {
    const fieldsChunk = snapshotDataObject(rawChunks[index], ["workspaceId", "sourceId", "versionId", "chunkId", "chunkIndex", "text", "locator", "start", "end"]);
    if (!fieldsChunk || Object.keys(fieldsChunk).length !== 9
      || fieldsChunk.workspaceId !== workspace.workspaceId || fieldsChunk.sourceId !== draftBase.sourceId
      || fieldsChunk.versionId !== draftBase.versionId || fieldsChunk.chunkIndex !== index
      || fieldsChunk.chunkId !== `${draftBase.sourceId}:${draftBase.versionId}:${index}`
      || typeof fieldsChunk.text !== "string" || fieldsChunk.text.length === 0 || fieldsChunk.text.length > 320
      || !Number.isSafeInteger(fieldsChunk.start) || !Number.isSafeInteger(fieldsChunk.end)
      || (fieldsChunk.start as number) < previousEnd || (fieldsChunk.end as number) <= (fieldsChunk.start as number)
      || draftBase.content.slice(fieldsChunk.start as number, fieldsChunk.end as number) !== fieldsChunk.text) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    const locatorRecord = snapshotDataObject(fieldsChunk.locator, ["kind", "chunkIndex", "start", "end", "page", "row"]);
    if (!locatorRecord || typeof locatorRecord.kind !== "string") throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    let locator: KnowledgeCitationLocator;
    if (locatorRecord.kind === "span" && Object.keys(locatorRecord).length === 4
      && Number.isSafeInteger(locatorRecord.chunkIndex) && Number.isSafeInteger(locatorRecord.start) && Number.isSafeInteger(locatorRecord.end)) {
      locator = Object.freeze({ kind: "span", chunkIndex: locatorRecord.chunkIndex as number, start: locatorRecord.start as number, end: locatorRecord.end as number });
    } else if (locatorRecord.kind === "page" && (Object.keys(locatorRecord).length === 2 || Object.keys(locatorRecord).length === 3)
      && Number.isSafeInteger(locatorRecord.page) && (locatorRecord.chunkIndex === undefined || Number.isSafeInteger(locatorRecord.chunkIndex))) {
      locator = Object.freeze({ kind: "page", page: locatorRecord.page as number, ...(locatorRecord.chunkIndex === undefined ? {} : { chunkIndex: locatorRecord.chunkIndex as number }) });
    } else if (locatorRecord.kind === "row" && (Object.keys(locatorRecord).length === 2 || Object.keys(locatorRecord).length === 3)
      && Number.isSafeInteger(locatorRecord.row) && (locatorRecord.chunkIndex === undefined || Number.isSafeInteger(locatorRecord.chunkIndex))) {
      locator = Object.freeze({ kind: "row", row: locatorRecord.row as number, ...(locatorRecord.chunkIndex === undefined ? {} : { chunkIndex: locatorRecord.chunkIndex as number }) });
    } else {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    if ((draftBase.kind === "faq" && locator.kind !== "span")
      || (draftBase.kind === "pdf" && locator.kind !== "page")
      || (draftBase.kind === "csv" && locator.kind !== "row")) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    if (locator.kind === "span") {
      if (locator.chunkIndex !== index || locator.start !== fieldsChunk.start || locator.end !== fieldsChunk.end) {
        throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
      }
    } else if (locator.kind === "page" || locator.kind === "row") {
      const position = locator.kind === "page" ? locator.page : locator.row;
      const locatorChunkIndex = locator.chunkIndex ?? 0;
      if (!Number.isSafeInteger(position) || position < 1 || !Number.isSafeInteger(locatorChunkIndex) || locatorChunkIndex < 0) {
        throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
      }
      const identity = locator.kind === "page" ? `page:${locator.page}` : `row:${locator.row}`;
      if (identity === previousLocator && locatorChunkIndex !== (index === 0 ? 0 : ((chunks[index - 1]!.locator as { chunkIndex?: number }).chunkIndex ?? 0) + 1)) {
        throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
      }
      if (identity !== previousLocator && locatorChunkIndex !== 0) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    } else {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    if (index > 0 && fieldsChunk.start !== previousEnd) {
      if (fieldsChunk.start !== previousEnd + 2 || draftBase.content.slice(previousEnd, fieldsChunk.start as number) !== "\n\n"
        || locatorIdentity(chunks[index - 1]!.locator) === locatorIdentity(locator)) {
        throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
      }
    }
    chunks.push(Object.freeze({
      workspaceId: workspace.workspaceId, sourceId: draftBase.sourceId, versionId: draftBase.versionId, chunkId: fieldsChunk.chunkId as string,
      chunkIndex: index, text: fieldsChunk.text, locator, start: fieldsChunk.start as number, end: fieldsChunk.end as number,
    }));
    previousEnd = fieldsChunk.end as number;
    previousLocator = locator.kind === "page" ? `page:${locator.page}`
      : locator.kind === "row" ? `row:${locator.row}` : locatorIdentity(locator);
  }
  return canonicalizeKnowledgeVersionDraft(workspace, Object.freeze({ ...draftBase, chunks: Object.freeze(chunks) }));
}

function isPostgresError(error: unknown): error is { code: string; constraint?: string } {
  return isRecord(error) && typeof error.code === "string";
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof KnowledgeError) throw error;
  if (isPostgresError(error)) {
    if (error.code === "23505" && error.constraint === "knowledge_one_approved_version_per_source") {
      throw new KnowledgeError("APPROVED_VERSION_EXISTS");
    }
    if (error.code === "23505" && error.constraint === "knowledge_versions_pkey") {
      throw new KnowledgeError("VERSION_CONFLICT");
    }
    if (error.code === "42501") throw new KnowledgeError("CROSS_WORKSPACE_ACCESS_DENIED");
    if (error.code === "23503") throw new KnowledgeError("SOURCE_NOT_FOUND");
    if (error.code === "23514") throw new KnowledgeError("INVALID_VERSION_TRANSITION");
  }
  throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
}

/** PostgreSQL implementation of the shared knowledge repository contract. */
export class PostgresKnowledgeRepository implements KnowledgeRepositoryPort {
  constructor(private readonly database: PostgresDatabasePort) {}

  private async scoped<T>(workspace: TrustedWorkspaceContext, operation: (query: PostgresQueryPort) => Promise<T>, isolation: "read committed" | "repeatable read" = "read committed"): Promise<T> {
    if (!isRecord(workspace) || typeof workspace.workspaceId !== "string" || !identifierPattern.test(workspace.workspaceId)) {
      throw new KnowledgeError("UNTRUSTED_WORKSPACE_SELECTOR");
    }
    try {
      return await this.database.transaction(async (query) => {
        if (isolation === "repeatable read") await query.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        await query.query("SELECT set_config('app.workspace_id', $1, true)", [workspace.workspaceId]);
        return operation(query);
      });
    } catch (error) {
      mapDatabaseError(error);
    }
  }

  async createSource(workspace: TrustedWorkspaceContext, input: Readonly<{
    sourceId: string; title: string; kind: KnowledgeSource["kind"];
  }>): Promise<KnowledgeSource> {
    const safeInput = snapshotSourceInput(input);
    return this.scoped(workspace, async (query) => {
      const inserted = await query.query<SourceRow>(
        `INSERT INTO knowledge_sources (workspace_id, source_id, kind, title, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, source_id) DO NOTHING
         RETURNING workspace_id, source_id, kind, title, status, created_at`,
        [workspace.workspaceId, safeInput.sourceId, safeInput.kind, safeInput.title, new Date().toISOString()],
      );
      if (inserted.rows[0]) return mapSource(inserted.rows[0]);
      const existing = await query.query<SourceRow>(
        `SELECT workspace_id, source_id, kind, title, status, created_at FROM knowledge_sources
         WHERE workspace_id = $1 AND source_id = $2 FOR UPDATE`,
        [workspace.workspaceId, safeInput.sourceId],
      );
      const source = existing.rows[0];
      if (!source) throw new KnowledgeError("SOURCE_NOT_FOUND");
      if (source.kind !== safeInput.kind || source.title !== safeInput.title) throw new KnowledgeError("SOURCE_CONFLICT");
      return mapSource(source);
    });
  }

  async getSource(workspace: TrustedWorkspaceContext, sourceId: string): Promise<KnowledgeSource | null> {
    return this.scoped(workspace, async (query) => {
      const result = await query.query<SourceRow>(
        `SELECT workspace_id, source_id, kind, title, status, created_at FROM knowledge_sources
         WHERE workspace_id = $1 AND source_id = $2`,
        [workspace.workspaceId, sourceId],
      );
      return result.rows[0] ? mapSource(result.rows[0]) : null;
    });
  }

  async archiveSource(workspace: TrustedWorkspaceContext, sourceId: string): Promise<KnowledgeSource> {
    return this.scoped(workspace, async (query) => {
      const result = await query.query<SourceRow>(
        `UPDATE knowledge_sources SET status = 'archived'
         WHERE workspace_id = $1 AND source_id = $2
         RETURNING workspace_id, source_id, kind, title, status, created_at`,
        [workspace.workspaceId, sourceId],
      );
      if (!result.rows[0]) throw new KnowledgeError("SOURCE_NOT_FOUND");
      return mapSource(result.rows[0]);
    });
  }

  async createVersion(workspace: TrustedWorkspaceContext, version: KnowledgeVersionDraft): Promise<KnowledgeVersion> {
    const safeVersion = snapshotVersionDraft(workspace, version);
    return this.scoped(workspace, async (query) => {
      const sourceResult = await query.query<SourceRow>(
        `SELECT workspace_id, source_id, kind, title, status, created_at FROM knowledge_sources
         WHERE workspace_id = $1 AND source_id = $2 FOR UPDATE`,
        [workspace.workspaceId, safeVersion.sourceId],
      );
      const source = sourceResult.rows[0];
      if (!source) throw new KnowledgeError("SOURCE_NOT_FOUND");
      if (source.status !== "active") throw new KnowledgeError("SOURCE_ARCHIVED");
      if (source.kind !== safeVersion.kind) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");

      const existing = await this.loadVersion(query, workspace.workspaceId, safeVersion.sourceId, safeVersion.versionId);
      if (existing) {
        if (!sameDraft(existing, safeVersion)) throw new KnowledgeError("VERSION_CONFLICT");
        return existing;
      }

      const inserted = await query.query<VersionRow>(
        `INSERT INTO knowledge_versions
         (workspace_id, source_id, version_id, kind, title, content, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING workspace_id, source_id, version_id, kind, title, content, status, created_at,
                   approved_at, approved_by, revoked_at, revoked_by, revocation_reason`,
        [workspace.workspaceId, safeVersion.sourceId, safeVersion.versionId, safeVersion.kind, safeVersion.title, safeVersion.content, safeVersion.createdAt],
      );
      if (!inserted.rows[0]) throw new KnowledgeError("VERSION_CONFLICT");

      for (let offset = 0; offset < safeVersion.chunks.length; offset += 500) {
        const batch = safeVersion.chunks.slice(offset, offset + 500);
        const values: unknown[] = [];
        const tuples = batch.map((chunk, batchIndex) => {
          const locator = chunk.locator;
          let locatorKind: string;
          let locatorPosition: number | null = null;
          let locatorChunkIndex: number;
          if (locator.kind === "page") {
            locatorKind = "page"; locatorPosition = locator.page; locatorChunkIndex = locator.chunkIndex ?? 0;
          } else if (locator.kind === "row") {
            locatorKind = "row"; locatorPosition = locator.row; locatorChunkIndex = locator.chunkIndex ?? 0;
          } else {
            locatorKind = locator.kind; locatorChunkIndex = locator.chunkIndex;
          }
          const rowValues = [workspace.workspaceId, safeVersion.sourceId, safeVersion.versionId, chunk.chunkId, chunk.chunkIndex,
            chunk.text, locatorKind, locatorChunkIndex, locatorPosition, chunk.start, chunk.end];
          const first = values.length + 1;
          values.push(...rowValues);
          return `(${rowValues.map((_, index) => `$${first + index}`).join(", ")})`;
        });
        await query.query(
          `INSERT INTO knowledge_chunks
           (workspace_id, source_id, version_id, chunk_id, chunk_index, text, locator_kind,
            locator_chunk_index, locator_position, start_offset, end_offset)
           VALUES ${tuples.join(", ")}`,
          values,
        );
      }
      return mapVersion(inserted.rows[0], safeVersion.chunks);
    });
  }

  async getVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string): Promise<KnowledgeVersion | null> {
    return this.scoped(workspace, (query) => this.loadVersion(query, workspace.workspaceId, sourceId, versionId));
  }

  async transitionVersion(
    workspace: TrustedWorkspaceContext,
    sourceId: string,
    versionId: string,
    next: KnowledgeVersionTransition,
  ): Promise<KnowledgeVersion> {
    const allowedFrom = transitionSources[next];
    if (!allowedFrom) throw new KnowledgeError("INVALID_VERSION_TRANSITION");
    return this.scoped(workspace, async (query) => {
      const updated = await query.query<VersionRow>(
        `UPDATE knowledge_versions SET status = $4
         WHERE workspace_id = $1 AND source_id = $2 AND version_id = $3 AND status = ANY($5::text[])
         RETURNING workspace_id, source_id, version_id, kind, title, content, status, created_at,
                   approved_at, approved_by, revoked_at, revoked_by, revocation_reason`,
        [workspace.workspaceId, sourceId, versionId, next, allowedFrom],
      );
      if (!updated.rows[0]) {
        const current = await this.loadVersion(query, workspace.workspaceId, sourceId, versionId);
        if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
        throw new KnowledgeError("INVALID_VERSION_TRANSITION");
      }
      const chunks = await this.loadChunks(query, workspace.workspaceId, sourceId, versionId);
      return mapVersion(updated.rows[0], chunks);
    });
  }

  async approveVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, input: {
    approvedBy: string; approvedAt?: string;
  }): Promise<KnowledgeVersion> {
    if (!isRecord(input) || !identifierPattern.test(input.approvedBy)
      || (input.approvedAt !== undefined && !Number.isFinite(Date.parse(input.approvedAt)))) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    return this.scoped(workspace, async (query) => {
      const approvedAt = input.approvedAt ?? new Date().toISOString();
      const sourceResult = await query.query<SourceRow>(
        `SELECT workspace_id, source_id, kind, title, status, created_at FROM knowledge_sources
         WHERE workspace_id = $1 AND source_id = $2 FOR UPDATE`,
        [workspace.workspaceId, sourceId],
      );
      const source = sourceResult.rows[0];
      if (!source) throw new KnowledgeError("SOURCE_NOT_FOUND");
      if (source.status !== "active") throw new KnowledgeError("APPROVAL_NOT_ELIGIBLE");
      const updated = await query.query<VersionRow>(
        `UPDATE knowledge_versions AS version SET status = 'approved', approved_at = $4, approved_by = $5
         WHERE workspace_id = $1 AND source_id = $2 AND version_id = $3 AND status = 'indexed'
           AND EXISTS (SELECT 1 FROM knowledge_chunks AS chunk
                       WHERE chunk.workspace_id = version.workspace_id AND chunk.source_id = version.source_id
                         AND chunk.version_id = version.version_id)
         RETURNING workspace_id, source_id, version_id, kind, title, content, status, created_at,
                   approved_at, approved_by, revoked_at, revoked_by, revocation_reason`,
        [workspace.workspaceId, sourceId, versionId, approvedAt, input.approvedBy],
      );
      if (!updated.rows[0]) {
        const current = await this.loadVersion(query, workspace.workspaceId, sourceId, versionId);
        if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
        throw new KnowledgeError("APPROVAL_NOT_ELIGIBLE");
      }
      const chunks = await this.loadChunks(query, workspace.workspaceId, sourceId, versionId);
      return mapVersion(updated.rows[0], chunks);
    });
  }

  async revokeVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, input: {
    revokedBy: string; reason: string; revokedAt?: string;
  }): Promise<KnowledgeVersion> {
    if (!isRecord(input) || !identifierPattern.test(input.revokedBy)
      || typeof input.reason !== "string" || input.reason.trim().length === 0 || input.reason.length > 500
      || (input.revokedAt !== undefined && !Number.isFinite(Date.parse(input.revokedAt)))) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    return this.scoped(workspace, async (query) => {
      const updated = await query.query<VersionRow>(
        `UPDATE knowledge_versions SET status = 'revoked', revoked_at = $4, revoked_by = $5, revocation_reason = $6
         WHERE workspace_id = $1 AND source_id = $2 AND version_id = $3 AND status = 'approved'
         RETURNING workspace_id, source_id, version_id, kind, title, content, status, created_at,
                   approved_at, approved_by, revoked_at, revoked_by, revocation_reason`,
        [workspace.workspaceId, sourceId, versionId, input.revokedAt ?? new Date().toISOString(), input.revokedBy, input.reason],
      );
      if (!updated.rows[0]) {
        const current = await this.loadVersion(query, workspace.workspaceId, sourceId, versionId);
        if (!current) throw new KnowledgeError("VERSION_NOT_FOUND");
        throw new KnowledgeError("REVOCATION_NOT_ELIGIBLE");
      }
      const chunks = await this.loadChunks(query, workspace.workspaceId, sourceId, versionId);
      return mapVersion(updated.rows[0], chunks);
    });
  }

  async isCurrentCitation(workspace: TrustedWorkspaceContext, citation: KnowledgeCitation): Promise<boolean> {
    if (citation.workspaceId !== workspace.workspaceId) return false;
    return this.scoped(workspace, (query) => this.isCurrentCitationIn(query, workspace, citation));
  }

  async areCurrentCitations(workspace: TrustedWorkspaceContext, citations: readonly KnowledgeCitation[]): Promise<boolean> {
    if (citations.length === 0 || citations.some((citation) => citation.workspaceId !== workspace.workspaceId)) return false;
    return this.scoped(workspace, async (query) => {
      for (const citation of citations) {
        if (!await this.isCurrentCitationIn(query, workspace, citation)) return false;
      }
      return true;
    }, "repeatable read");
  }

  private async isCurrentCitationIn(query: PostgresQueryPort, workspace: TrustedWorkspaceContext, citation: KnowledgeCitation): Promise<boolean> {
    const locator = citation.locator;
    let position: number | null = null;
    if (locator.kind === "page") position = locator.page;
    else if (locator.kind === "row") position = locator.row;
    const chunkIndex = locator.kind === "span" || locator.kind === "chunk"
      ? locator.chunkIndex
      : locator.chunkIndex ?? 0;
    const start = locator.kind === "span" ? locator.start : null;
    const end = locator.kind === "span" ? locator.end : null;
    const result = await query.query<PostgresRow>(
        `SELECT 1 AS current
         FROM knowledge_sources AS source
         JOIN knowledge_versions AS version ON version.workspace_id = source.workspace_id AND version.source_id = source.source_id
         JOIN knowledge_chunks AS chunk ON chunk.workspace_id = version.workspace_id AND chunk.source_id = version.source_id
           AND chunk.version_id = version.version_id
         WHERE source.workspace_id = $1 AND source.source_id = $2 AND source.status = 'active'
           AND version.version_id = $3 AND version.status = 'approved' AND chunk.chunk_id = $4
           AND chunk.locator_kind = $5 AND chunk.locator_chunk_index = $6
           AND ($5 <> 'span' OR (chunk.start_offset = $7 AND chunk.end_offset = $8))
           AND chunk.locator_position IS NOT DISTINCT FROM $9`,
        [workspace.workspaceId, citation.sourceId, citation.sourceVersionId, citation.chunkId,
          locator.kind, chunkIndex, start, end, position],
    );
    return result.rows.length === 1;
  }

  async listRetrievableChunks(workspace: TrustedWorkspaceContext): Promise<readonly Readonly<{
    source: KnowledgeSource;
    version: KnowledgeVersion;
    chunk: KnowledgeChunk;
  }>[]> {
    return this.scoped(workspace, async (query) => {
      const result = await query.query<RetrievableRow>(
        `SELECT source.workspace_id, source.source_id, source.kind AS source_kind, source.title AS source_title,
                source.status AS source_status, source.created_at AS source_created_at,
                version.version_id, version.kind AS version_kind, version.title AS version_title,
                version.content, version.status AS version_status, version.created_at AS version_created_at,
                version.approved_at, version.approved_by, version.revoked_at, version.revoked_by, version.revocation_reason,
                chunk.chunk_id, chunk.chunk_index, chunk.text, chunk.locator_kind, chunk.locator_chunk_index,
                chunk.locator_position, chunk.start_offset, chunk.end_offset
         FROM knowledge_sources AS source
         JOIN knowledge_versions AS version ON version.workspace_id = source.workspace_id AND version.source_id = source.source_id
         JOIN knowledge_chunks AS chunk ON chunk.workspace_id = version.workspace_id AND chunk.source_id = version.source_id
           AND chunk.version_id = version.version_id
         WHERE source.workspace_id = $1 AND source.status = 'active' AND version.status = 'approved'
         ORDER BY source.source_id, version.version_id, chunk.chunk_index`,
        [workspace.workspaceId],
      );
      const chunksByVersion = new Map<string, readonly KnowledgeChunk[]>();
      const rowsByVersion = new Map<string, RetrievableRow[]>();
      const sourcesByVersion = new Map<string, KnowledgeSource>();
      const versionsById = new Map<string, KnowledgeVersion>();
      for (const row of result.rows) {
        const key = `${row.workspace_id}|${row.source_id}|${row.version_id}`;
        const rows = rowsByVersion.get(key) ?? [];
        rows.push(row);
        rowsByVersion.set(key, rows);
      }
      for (const [key, rows] of rowsByVersion) {
        chunksByVersion.set(key, Object.freeze(rows.map((row) => mapChunk({
          workspace_id: row.workspace_id, source_id: row.source_id, version_id: row.version_id,
          chunk_id: row.chunk_id, chunk_index: row.chunk_index, text: row.text, locator_kind: row.locator_kind,
          locator_chunk_index: row.locator_chunk_index, locator_position: row.locator_position,
          start_offset: row.start_offset, end_offset: row.end_offset,
        } as ChunkRow))));
      }
      return Object.freeze(result.rows.map((row) => {
        const key = `${row.workspace_id}|${row.source_id}|${row.version_id}`;
        let source = sourcesByVersion.get(key);
        if (!source) {
          source = mapSource({ workspace_id: row.workspace_id, source_id: row.source_id, kind: row.source_kind,
            title: row.source_title, status: row.source_status, created_at: row.source_created_at } as SourceRow);
          sourcesByVersion.set(key, source);
        }
        let version = versionsById.get(key);
        if (!version) {
          version = mapVersion({ workspace_id: row.workspace_id, source_id: row.source_id, version_id: row.version_id,
            kind: row.version_kind, title: row.version_title, content: row.content, status: row.version_status,
            created_at: row.version_created_at, approved_at: row.approved_at, approved_by: row.approved_by,
            revoked_at: row.revoked_at, revoked_by: row.revoked_by, revocation_reason: row.revocation_reason
          } as VersionRow, chunksByVersion.get(key) ?? []);
          versionsById.set(key, version);
        }
        const chunk = mapChunk({
          workspace_id: row.workspace_id, source_id: row.source_id, version_id: row.version_id,
          chunk_id: row.chunk_id, chunk_index: row.chunk_index, text: row.text, locator_kind: row.locator_kind,
          locator_chunk_index: row.locator_chunk_index, locator_position: row.locator_position,
          start_offset: row.start_offset, end_offset: row.end_offset,
        } as ChunkRow);
        return Object.freeze({ source, version, chunk });
      }));
    });
  }

  private async loadVersion(
    query: PostgresQueryPort,
    workspaceId: string,
    sourceId: string,
    versionId: string,
  ): Promise<KnowledgeVersion | null> {
    const result = await query.query<VersionRow>(
      `SELECT workspace_id, source_id, version_id, kind, title, content, status, created_at,
              approved_at, approved_by, revoked_at, revoked_by, revocation_reason
       FROM knowledge_versions WHERE workspace_id = $1 AND source_id = $2 AND version_id = $3`,
      [workspaceId, sourceId, versionId],
    );
    const row = result.rows[0];
    return row ? mapVersion(row, await this.loadChunks(query, workspaceId, sourceId, versionId)) : null;
  }

  private async loadChunks(query: PostgresQueryPort, workspaceId: string, sourceId: string, versionId: string): Promise<readonly KnowledgeChunk[]> {
    const result = await query.query<ChunkRow>(
      `SELECT workspace_id, source_id, version_id, chunk_id, chunk_index, text, locator_kind,
              locator_chunk_index, locator_position, start_offset, end_offset
       FROM knowledge_chunks WHERE workspace_id = $1 AND source_id = $2 AND version_id = $3 ORDER BY chunk_index`,
      [workspaceId, sourceId, versionId],
    );
    return Object.freeze(result.rows.map(mapChunk));
  }
}

function sameDraft(existing: KnowledgeVersion, draft: KnowledgeVersionDraft): boolean {
  return existing.workspaceId === draft.workspaceId && existing.sourceId === draft.sourceId
    && existing.versionId === draft.versionId && existing.kind === draft.kind && existing.title === draft.title
    && existing.content === draft.content && existing.chunks.length === draft.chunks.length
    && existing.chunks.every((chunk, index) => {
      const candidate = draft.chunks[index];
      return Boolean(candidate) && chunk.chunkId === candidate!.chunkId && chunk.chunkIndex === candidate!.chunkIndex
        && chunk.text === candidate!.text && chunk.start === candidate!.start && chunk.end === candidate!.end
        && locatorIdentity(chunk.locator) === locatorIdentity(candidate!.locator);
    });
}
