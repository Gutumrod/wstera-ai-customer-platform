import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";
import type { KnowledgeQuarantineRecord, KnowledgeIntakeAuditPort } from "../../../contracts/data/knowledge-intake.js";
import type { PostgresDatabasePort, PostgresRow } from "./knowledge-repository.js";

type QuarantineRow = PostgresRow & {
  workspace_id: string;
  attempt_id: string;
  idempotency_key: string;
  request_hash: string;
  kind: "pdf" | "csv";
  title: string;
  filename: string | null;
  content_type: string | null;
  byte_size: number | string;
  object_path: string | null;
  failure_code: string;
  created_at: string | Date;
};

type OriginalReferenceRow = PostgresRow & { workspace_id: string };

function mapRecord(row: QuarantineRow): KnowledgeQuarantineRecord {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString();
  return Object.freeze({
    workspaceId: row.workspace_id,
    attemptId: row.attempt_id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    kind: row.kind,
    title: row.title,
    ...(row.filename ? { filename: row.filename } : {}),
    ...(row.content_type ? { contentType: row.content_type } : {}),
    byteSize: Number(row.byte_size),
    ...(row.object_path ? { objectPath: row.object_path } : {}),
    failureCode: row.failure_code,
    createdAt,
  });
}

/** Persists rejected uploads separately from retrievable knowledge versions. */
export class PostgresKnowledgeIntakeAudit implements KnowledgeIntakeAuditPort {
  constructor(private readonly database: PostgresDatabasePort) {}

  async recordOriginal(
    workspace: TrustedWorkspaceContext,
    input: Readonly<{ sourceId: string; versionId: string; objectPath: string; filename: string; contentType: string; byteSize: number }>,
  ): Promise<void> {
    await this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [workspace.workspaceId]);
      const values = [workspace.workspaceId, input.sourceId, input.versionId, input.objectPath, input.filename, input.contentType, input.byteSize];
      const result = await query.query<OriginalReferenceRow>(
        "INSERT INTO aicp.knowledge_original_objects " +
        "(workspace_id, source_id, version_id, object_path, filename, content_type, byte_size) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $7) " +
        "ON CONFLICT (workspace_id, source_id, version_id) DO NOTHING RETURNING workspace_id",
        values,
      );
      if (result.rows[0]) return;
      const existing = await query.query<PostgresRow & { object_path: string; filename: string; content_type: string; byte_size: number | string }>(
        "SELECT object_path, filename, content_type, byte_size FROM aicp.knowledge_original_objects " +
        "WHERE workspace_id = $1 AND source_id = $2 AND version_id = $3",
        values.slice(0, 3),
      );
      const row = existing.rows[0];
      if (!row || row.object_path !== input.objectPath || row.filename !== input.filename
        || row.content_type !== input.contentType || Number(row.byte_size) !== input.byteSize) {
        throw new Error("KNOWLEDGE_ORIGINAL_REFERENCE_CONFLICT");
      }
    });
  }

  async quarantine(workspace: TrustedWorkspaceContext, input: Omit<KnowledgeQuarantineRecord, "workspaceId" | "createdAt">): Promise<KnowledgeQuarantineRecord> {
    return this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [workspace.workspaceId]);
      const inserted = await query.query<QuarantineRow>(
        `INSERT INTO aicp.knowledge_quarantine_records
           (workspace_id, attempt_id, idempotency_key, request_hash, kind, title, filename, content_type,
            byte_size, object_path, failure_code, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
         ON CONFLICT (workspace_id, idempotency_key) DO UPDATE
           SET object_path = COALESCE(aicp.knowledge_quarantine_records.object_path, EXCLUDED.object_path)
           WHERE aicp.knowledge_quarantine_records.request_hash = EXCLUDED.request_hash
         RETURNING workspace_id, attempt_id, idempotency_key, request_hash, kind, title, filename,
                   content_type, byte_size, object_path, failure_code, created_at`,
        [workspace.workspaceId, input.attemptId, input.idempotencyKey, input.requestHash, input.kind, input.title,
          input.filename ?? null, input.contentType ?? null, input.byteSize, input.objectPath ?? null, input.failureCode],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("KNOWLEDGE_QUARANTINE_IDEMPOTENCY_CONFLICT");
      if (row.attempt_id !== input.attemptId || row.failure_code !== input.failureCode) {
        throw new Error("KNOWLEDGE_QUARANTINE_IDEMPOTENCY_CONFLICT");
      }
      return mapRecord(row);
    });
  }

  async listQuarantine(workspace: TrustedWorkspaceContext): Promise<readonly KnowledgeQuarantineRecord[]> {
    return this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [workspace.workspaceId]);
      const result = await query.query<QuarantineRow>(
        `SELECT workspace_id, attempt_id, idempotency_key, request_hash, kind, title, filename,
                content_type, byte_size, object_path, failure_code, created_at
         FROM aicp.knowledge_quarantine_records
         WHERE workspace_id = $1 ORDER BY created_at DESC, attempt_id LIMIT 100`,
        [workspace.workspaceId],
      );
      return Object.freeze(result.rows.map(mapRecord));
    });
  }
}
