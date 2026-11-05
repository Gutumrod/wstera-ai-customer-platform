import type { ModelSpendLedgerPort, ModelSpendReservation, ModelSpendReservationResult, ModelTokenUsage } from "../../../contracts/models/index.js";
import type { PostgresDatabasePort } from "./knowledge-repository.js";

/** Durable ledger in aicp.model_usage. Reservation is serialized per workspace by a transaction-scoped advisory lock. */
export class PostgresModelSpendLedger implements ModelSpendLedgerPort {
  constructor(private readonly database: PostgresDatabasePort) {}

  async reserve(r: ModelSpendReservation): Promise<ModelSpendReservationResult> {
    return this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [r.workspaceId]);
      await query.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`aicp.model_usage:${r.workspaceId}`]);
      const today = await query.query<{ cost: string; calls: string }>(
        `SELECT coalesce(sum(estimated_cost_micros), 0)::text AS cost, count(*)::text AS calls
         FROM aicp.model_usage WHERE workspace_id = $1 AND usage_day = (now() AT TIME ZONE 'utc')::date`, [r.workspaceId]);
      const cost = Number(today.rows[0]?.cost ?? "0");
      const calls = Number(today.rows[0]?.calls ?? "0");
      if (!Number.isFinite(cost) || !Number.isFinite(calls)) throw new Error("MODEL_USAGE_UNREADABLE");
      if (calls + 1 > r.limits.maxDailyCalls) return Object.freeze({ kind: "limit", reason: "DAILY_CALL_LIMIT" });
      if (cost + r.reserveCostMicros > r.limits.maxDailyCostMicros) return Object.freeze({ kind: "limit", reason: "DAILY_COST_LIMIT" });
      const inserted = await query.query<{ id: string }>(
        `INSERT INTO aicp.model_usage (workspace_id, conversation_id, provider_id, model, operation, estimated_cost_micros)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [r.workspaceId, r.conversationId, r.providerId, r.model, r.operation, r.reserveCostMicros]);
      const callId = inserted.rows[0]?.id;
      if (!callId) throw new Error("MODEL_USAGE_NOT_RESERVED");
      return Object.freeze({ kind: "reserved", callId });
    });
  }

  async settle(input: Readonly<{ workspaceId: string; callId: string; usage: ModelTokenUsage; costMicros: number }>): Promise<void> {
    await this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [input.workspaceId]);
      const updated = await query.query<{ id: string }>(
        `UPDATE aicp.model_usage SET status='settled', input_tokens=$3::integer, output_tokens=$4::integer, total_tokens=$5::integer, estimated_cost_micros=$6, updated_at=now()
         WHERE id=$1::uuid AND workspace_id=$2 AND status='reserved' RETURNING id`,
        [input.callId, input.workspaceId, input.usage.inputTokens, input.usage.outputTokens, input.usage.totalTokens, input.costMicros]);
      if (updated.rows.length !== 1) throw new Error("MODEL_USAGE_NOT_SETTLED");
    });
  }

  async fail(input: Readonly<{ workspaceId: string; callId: string }>): Promise<void> {
    await this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [input.workspaceId]);
      await query.query("UPDATE aicp.model_usage SET status='failed', updated_at=now() WHERE id=$1::uuid AND workspace_id=$2 AND status='reserved'", [input.callId, input.workspaceId]);
    });
  }
}
