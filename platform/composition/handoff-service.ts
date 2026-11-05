import type { PostgresDatabasePort, PostgresQueryPort, PostgresRow } from "../adapters/persistence/postgres/knowledge-repository.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";

export class HandoffServiceError extends Error {
  constructor(readonly code: "MEMBERSHIP_REQUIRED" | "CONVERSATION_NOT_FOUND" | "HANDOFF_NOT_OPEN" | "AI_ACTIVE" | "NOT_ASSIGNED" | "INVALID_INPUT") { super(code); }
}

type ConversationRow = PostgresRow & {
  conversation_id: string; status: string; version: number; handoff_reason: string | null;
  assigned_staff_id: string | null; created_at: Date | string; updated_at: Date | string;
};
type MessageRow = PostgresRow & { id: string; conversation_id: string; role: "customer" | "bot" | "staff"; body: string; staff_id: string | null; delivery_id: string | null; created_at: Date | string };
const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();

async function authorize(query: PostgresQueryPort, workspace: TrustedWorkspaceContext, actorUserId: string) {
  try { await query.query("SELECT aicp.assert_active_knowledge_writer($1, $2)", [workspace.workspaceId, actorUserId]); }
  catch { throw new HandoffServiceError("MEMBERSHIP_REQUIRED"); }
}
function conversation(row: ConversationRow) {
  return { conversationId: row.conversation_id, status: row.status, version: row.version,
    reason: row.handoff_reason, assignedStaffId: row.assigned_staff_id,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
function message(row: MessageRow) {
  return { id: row.id, role: row.role, text: row.body, staffId: row.staff_id, deliveryId: row.delivery_id, createdAt: iso(row.created_at) };
}

/** Framework-neutral staff API operations. Auth and membership checks run in the same transaction as every read/write. */
export class HandoffService {
  constructor(private readonly database: PostgresDatabasePort) {}

  private scoped<T>(workspace: TrustedWorkspaceContext, actorUserId: string, operation: (query: PostgresQueryPort) => Promise<T>): Promise<T> {
    return this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [workspace.workspaceId]);
      await authorize(query, workspace, actorUserId);
      return operation(query);
    });
  }

  list(workspace: TrustedWorkspaceContext, actorUserId: string) {
    return this.scoped(workspace, actorUserId, async (query) => {
      const result = await query.query<ConversationRow & { last_customer_message: string | null }>(
        `SELECT c.conversation_id, c.status, c.version, c.handoff_reason, c.assigned_staff_id, c.created_at, c.updated_at,
                latest_customer.body AS last_customer_message
         FROM aicp.conversations AS c
         LEFT JOIN LATERAL (
           SELECT m.body FROM aicp.conversation_messages AS m
           WHERE m.workspace_id = c.workspace_id AND m.conversation_id = c.conversation_id AND m.role = 'customer'
           ORDER BY m.created_at DESC, m.id DESC LIMIT 1
         ) AS latest_customer ON true
         WHERE c.workspace_id = $1 AND c.status IN ('handoff_requested', 'human_active')
         ORDER BY c.updated_at ASC, c.conversation_id ASC`, [workspace.workspaceId]);
      return result.rows.map((row) => ({ ...conversation(row), lastCustomerMessage: row.last_customer_message ? Array.from(row.last_customer_message).slice(0, 120).join("") : null }));
    });
  }

  messages(workspace: TrustedWorkspaceContext, actorUserId: string, conversationId: string) {
    return this.scoped(workspace, actorUserId, async (query) => {
      const exists = await query.query("SELECT 1 FROM aicp.conversations WHERE workspace_id = $1 AND conversation_id = $2", [workspace.workspaceId, conversationId]);
      if (!exists.rows.length) throw new HandoffServiceError("CONVERSATION_NOT_FOUND");
      const result = await query.query<MessageRow>(
        `SELECT id, conversation_id, role, body, staff_id, delivery_id, created_at FROM aicp.conversation_messages
         WHERE workspace_id = $1 AND conversation_id = $2 ORDER BY created_at ASC, id ASC`, [workspace.workspaceId, conversationId]);
      return result.rows.map(message);
    });
  }

  claim(workspace: TrustedWorkspaceContext, actorUserId: string, conversationId: string) {
    return this.scoped(workspace, actorUserId, async (query) => {
      const result = await query.query<ConversationRow>(
        "SELECT conversation_id, status, version, handoff_reason, assigned_staff_id, created_at, updated_at FROM aicp.conversations WHERE workspace_id = $1 AND conversation_id = $2 FOR UPDATE", [workspace.workspaceId, conversationId]);
      const row = result.rows[0];
      if (!row) throw new HandoffServiceError("CONVERSATION_NOT_FOUND");
      if (row.status === "human_active" && row.assigned_staff_id === actorUserId) return conversation(row);
      if (row.status !== "handoff_requested") throw new HandoffServiceError("HANDOFF_NOT_OPEN");
      const now = new Date().toISOString();
      const version = row.version + 1;
      await query.query("UPDATE aicp.conversations SET status='human_active', assigned_staff_id=$3, version=$4, updated_at=$5 WHERE workspace_id=$1 AND conversation_id=$2", [workspace.workspaceId, conversationId, actorUserId, version, now]);
      await query.query("INSERT INTO aicp.conversation_events (workspace_id, conversation_id, version, event_kind, payload, created_at) VALUES ($1,$2,$3,'operator_claimed',$4::jsonb,$5)", [workspace.workspaceId, conversationId, version, JSON.stringify({ kind: "operator_claimed", staffId: actorUserId, occurredAt: now }), now]);
      return { ...conversation(row), status: "human_active", assignedStaffId: actorUserId, version, updatedAt: now };
    });
  }

  reply(workspace: TrustedWorkspaceContext, actorUserId: string, conversationId: string, text: string, deliveryId: string) {
    if (!text.trim() || text.length > 5000 || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(deliveryId)) throw new HandoffServiceError("INVALID_INPUT");
    return this.scoped(workspace, actorUserId, async (query) => {
      // Serialize retries by workspace/delivery ID so a concurrent retry sees the committed row.
      await query.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [workspace.workspaceId, deliveryId]);
      const duplicate = await query.query<MessageRow>("SELECT id, conversation_id, role, body, staff_id, delivery_id, created_at FROM aicp.conversation_messages WHERE workspace_id=$1 AND delivery_id=$2", [workspace.workspaceId, deliveryId]);
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].conversation_id !== conversationId) throw new HandoffServiceError("HANDOFF_NOT_OPEN");
        return { message: message(duplicate.rows[0]), duplicate: true };
      }
      const result = await query.query<ConversationRow>(
        "SELECT conversation_id, status, version, handoff_reason, assigned_staff_id, created_at, updated_at FROM aicp.conversations WHERE workspace_id = $1 AND conversation_id = $2 FOR UPDATE", [workspace.workspaceId, conversationId]);
      const row = result.rows[0];
      if (!row) throw new HandoffServiceError("CONVERSATION_NOT_FOUND");
      if (row.status === "ai_active") throw new HandoffServiceError("AI_ACTIVE");
      if (row.status === "human_active" && row.assigned_staff_id !== actorUserId) throw new HandoffServiceError("NOT_ASSIGNED");
      let version = row.version;
      const now = new Date().toISOString();
      if (row.status === "handoff_requested") {
        version += 1;
        await query.query("UPDATE aicp.conversations SET status='human_active', assigned_staff_id=$3, version=$4, updated_at=$5 WHERE workspace_id=$1 AND conversation_id=$2", [workspace.workspaceId, conversationId, actorUserId, version, now]);
        await query.query("INSERT INTO aicp.conversation_events (workspace_id, conversation_id, version, event_kind, payload, created_at) VALUES ($1,$2,$3,'operator_claimed',$4::jsonb,$5)", [workspace.workspaceId, conversationId, version, JSON.stringify({ kind: "operator_claimed", staffId: actorUserId, occurredAt: now }), now]);
      }
      version += 1;
      const payload = { kind: "staff_reply_delivered", staffId: actorUserId, deliveryId, occurredAt: now };
      await query.query("UPDATE aicp.conversations SET last_staff_delivery_id=$3, version=$4, updated_at=$5 WHERE workspace_id=$1 AND conversation_id=$2", [workspace.workspaceId, conversationId, deliveryId, version, now]);
      await query.query("INSERT INTO aicp.conversation_events (workspace_id, conversation_id, version, event_kind, payload, created_at) VALUES ($1,$2,$3,'staff_reply_delivered',$4::jsonb,$5)", [workspace.workspaceId, conversationId, version, JSON.stringify(payload), now]);
      const inserted = await query.query<MessageRow>(
        `INSERT INTO aicp.conversation_messages (workspace_id, conversation_id, role, body, staff_id, delivery_id, created_at)
         VALUES ($1,$2,'staff',$3,$4,$5,$6) RETURNING id, conversation_id, role, body, staff_id, delivery_id, created_at`, [workspace.workspaceId, conversationId, text.trim(), actorUserId, deliveryId, now]);
      return { message: message(inserted.rows[0]!), duplicate: false };
    });
  }

  release(workspace: TrustedWorkspaceContext, actorUserId: string, conversationId: string) {
    return this.scoped(workspace, actorUserId, async (query) => {
      const result = await query.query<ConversationRow>(
        "SELECT conversation_id, status, version, handoff_reason, assigned_staff_id, created_at, updated_at FROM aicp.conversations WHERE workspace_id = $1 AND conversation_id = $2 FOR UPDATE", [workspace.workspaceId, conversationId]);
      const row = result.rows[0];
      if (!row) throw new HandoffServiceError("CONVERSATION_NOT_FOUND");
      if (row.status !== "human_active") throw new HandoffServiceError("HANDOFF_NOT_OPEN");
      if (row.assigned_staff_id !== actorUserId) throw new HandoffServiceError("NOT_ASSIGNED");
      const now = new Date().toISOString();
      const version = row.version + 1;
      const payload = { kind: "handoff_released", staffId: actorUserId, occurredAt: now };
      await query.query("UPDATE aicp.conversations SET status='ai_active', assigned_staff_id=NULL, handoff_reason=NULL, version=$3, updated_at=$4 WHERE workspace_id=$1 AND conversation_id=$2", [workspace.workspaceId, conversationId, version, now]);
      await query.query("INSERT INTO aicp.conversation_events (workspace_id, conversation_id, version, event_kind, payload, created_at) VALUES ($1,$2,$3,'handoff_released',$4::jsonb,$5)", [workspace.workspaceId, conversationId, version, JSON.stringify(payload), now]);
      return { ...conversation(row), status: "ai_active", assignedStaffId: null, version, updatedAt: now };
    });
  }
}
