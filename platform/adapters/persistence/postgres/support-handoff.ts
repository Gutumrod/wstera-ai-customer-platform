import type { SupportHandoffPort, SupportHandoffReason } from "../../../modules/ai-engine/support-orchestrator.js";
import type { PostgresDatabasePort, PostgresRow } from "./knowledge-repository.js";

type StateRow = PostgresRow & { status: string; version: number; handoff_reason: string | null };

function notificationReason(reason: SupportHandoffReason): "no_answer" | "conflicting_evidence" {
  return reason === "CONFLICTING_EVIDENCE" ? "conflicting_evidence" : "no_answer";
}

/** Persists the state transition, immutable event, and staff notification outbox atomically. */
export class PostgresSupportHandoff implements SupportHandoffPort {
  constructor(private readonly database: PostgresDatabasePort) {}

  async request(input: Parameters<SupportHandoffPort["request"]>[0]): Promise<void> {
    await this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [input.workspace.workspaceId]);
      const selected = await query.query<StateRow>(
        "SELECT status, version, handoff_reason FROM aicp.conversations WHERE workspace_id = $1 AND conversation_id = $2 FOR UPDATE",
        [input.workspace.workspaceId, input.conversationId]);
      const current = selected.rows[0];
      if (!current || current.status !== "ai_active") return;
      const reason = notificationReason(input.reason);
      const occurredAt = new Date().toISOString();
      const nextVersion = current.version + 1;
      await query.query(
        `UPDATE aicp.conversations SET status = 'handoff_requested', version = $3,
           handoff_reason = $4, updated_at = $5 WHERE workspace_id = $1 AND conversation_id = $2 AND version = $6`,
        [input.workspace.workspaceId, input.conversationId, nextVersion, reason, occurredAt, current.version]);
      const event = { kind: "handoff_requested", reason, occurredAt };
      await query.query(
        "INSERT INTO aicp.conversation_events (workspace_id, conversation_id, version, event_kind, payload, created_at) VALUES ($1, $2, $3, 'handoff_requested', $4::jsonb, $5)",
        [input.workspace.workspaceId, input.conversationId, nextVersion, JSON.stringify(event), occurredAt]);
      await query.query(
        `INSERT INTO aicp.handoff_notifications (workspace_id, conversation_id, reason)
         VALUES ($1, $2, $3)
         ON CONFLICT (workspace_id, conversation_id) WHERE status IN ('pending', 'processing') DO NOTHING`,
        [input.workspace.workspaceId, input.conversationId, reason]);
    });
  }
}
