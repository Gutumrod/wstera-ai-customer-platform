import type { ConversationEvent, ConversationRepositoryPort, ConversationSnapshot } from "../../../contracts/data/conversation.js";
import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";
import { ConversationError, applyConversationEvent } from "../../../modules/conversation/index.js";
import type { PostgresDatabasePort, PostgresRow } from "./knowledge-repository.js";

type ConversationRow = PostgresRow & {
  workspace_id: string; conversation_id: string; status: ConversationSnapshot["status"]; version: number;
  handoff_reason: ConversationSnapshot["handoffReason"] | null; assigned_staff_id: string | null;
  last_staff_delivery_id: string | null; created_at: Date | string; updated_at: Date | string;
};

function timestamp(value: Date | string): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
function snapshot(row: ConversationRow): ConversationSnapshot {
  return Object.freeze({ workspaceId: row.workspace_id, conversationId: row.conversation_id, status: row.status,
    version: row.version, createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at),
    ...(row.handoff_reason ? { handoffReason: row.handoff_reason } : {}),
    ...(row.assigned_staff_id ? { assignedStaffId: row.assigned_staff_id } : {}),
    ...(row.last_staff_delivery_id ? { lastStaffDeliveryId: row.last_staff_delivery_id } : {}),
  });
}

/** Durable implementation of the existing conversation contract. Each mutation and event append share one transaction. */
export class PostgresConversationRepository implements ConversationRepositoryPort {
  constructor(private readonly database: PostgresDatabasePort) {}

  async create(workspace: TrustedWorkspaceContext, conversationId: string, now = new Date().toISOString()): Promise<ConversationSnapshot> {
    return this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [workspace.workspaceId]);
      try {
        const result = await query.query<ConversationRow>(
          `INSERT INTO aicp.conversations (workspace_id, conversation_id, created_at, updated_at)
           VALUES ($1, $2, $3, $3) RETURNING *`, [workspace.workspaceId, conversationId, now]);
        return snapshot(result.rows[0]!);
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new ConversationError("CONVERSATION_EXISTS");
        throw error;
      }
    });
  }

  async load(workspace: TrustedWorkspaceContext, conversationId: string): Promise<ConversationSnapshot | null> {
    return this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [workspace.workspaceId]);
      const result = await query.query<ConversationRow>(
        "SELECT * FROM aicp.conversations WHERE workspace_id = $1 AND conversation_id = $2", [workspace.workspaceId, conversationId]);
      return result.rows[0] ? snapshot(result.rows[0]) : null;
    });
  }

  async append(workspace: TrustedWorkspaceContext, conversationId: string, expectedVersion: number, event: ConversationEvent): Promise<ConversationSnapshot> {
    return this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [workspace.workspaceId]);
      const currentResult = await query.query<ConversationRow>(
        "SELECT * FROM aicp.conversations WHERE workspace_id = $1 AND conversation_id = $2 FOR UPDATE", [workspace.workspaceId, conversationId]);
      const row = currentResult.rows[0];
      if (!row) throw new ConversationError("CONVERSATION_NOT_FOUND");
      const current = snapshot(row);
      if (event.kind === "staff_reply_delivered" && current.lastStaffDeliveryId === event.deliveryId) return current;
      if (current.version !== expectedVersion) throw new ConversationError("VERSION_CONFLICT");
      const next = applyConversationEvent(current, event);
      const update = await query.query<ConversationRow>(
        `UPDATE aicp.conversations SET status = $3, version = $4, handoff_reason = $5,
           assigned_staff_id = $6, last_staff_delivery_id = $7, updated_at = $8
         WHERE workspace_id = $1 AND conversation_id = $2 AND version = $9 RETURNING *`,
        [workspace.workspaceId, conversationId, next.status, next.version, next.handoffReason ?? null,
          next.assignedStaffId ?? null, next.lastStaffDeliveryId ?? null, event.occurredAt, expectedVersion]);
      if (!update.rows[0]) throw new ConversationError("VERSION_CONFLICT");
      await query.query(
        "INSERT INTO aicp.conversation_events (workspace_id, conversation_id, version, event_kind, payload, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)",
        [workspace.workspaceId, conversationId, next.version, event.kind, JSON.stringify(event), event.occurredAt]);
      return snapshot(update.rows[0]);
    });
  }
}
