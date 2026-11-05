import { randomUUID } from "node:crypto";
import type { ConversationMessagePort, StaffConversationMessage } from "../../../contracts/data/conversation-messages.js";
import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";
import type { PostgresDatabasePort, PostgresRow } from "./knowledge-repository.js";

type MessageRow = PostgresRow & { id: string; body: string; role: string; created_at: Date | string };
type CursorRow = PostgresRow & { id: string; created_at: Date | string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function cursorEncode(row: CursorRow): string { return Buffer.from(`${new Date(row.created_at).toISOString()}|${row.id}`).toString("base64url"); }
function cursorDecode(value: string | null): { timestamp: string; id: string } | null {
  if (value === null) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    if (separator < 0 || !Number.isFinite(Date.parse(decoded.slice(0, separator))) || !uuidPattern.test(decoded.slice(separator + 1))) return null;
    return { timestamp: new Date(decoded.slice(0, separator)).toISOString(), id: decoded.slice(separator + 1) };
  } catch { return null; }
}

export class PostgresConversationMessages implements ConversationMessagePort {
  constructor(private readonly database: PostgresDatabasePort) {}

  async appendTurn(input: Readonly<{ workspace: TrustedWorkspaceContext; conversationId: string; customerText: string; botText: string }>): Promise<void> {
    if (input.customerText.length > 5000 || input.botText.length > 5000) throw new Error("MESSAGE_TOO_LONG");
    // clock_timestamp (not the transaction-wide now()) orders the pair; the +1us guards clocks too coarse to tell two inserts apart (PGlite).
    await this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [input.workspace.workspaceId]);
      await query.query("INSERT INTO aicp.conversation_messages (workspace_id, conversation_id, role, body, created_at) VALUES ($1,$2,'customer',$3,clock_timestamp())", [input.workspace.workspaceId, input.conversationId, input.customerText]);
      await query.query("INSERT INTO aicp.conversation_messages (workspace_id, conversation_id, role, body, delivery_id, created_at) VALUES ($1,$2,'bot',$3,$4,clock_timestamp() + interval '1 microsecond')", [input.workspace.workspaceId, input.conversationId, input.botText, randomUUID()]);
    });
  }

  async staffUpdates(input: Readonly<{ workspace: TrustedWorkspaceContext; conversationId: string; after: string | null; limit: number }>): Promise<Readonly<{ messages: readonly StaffConversationMessage[]; cursor: string | null }>> {
    const cursor = cursorDecode(input.after);
    if (input.after !== null && cursor === null) throw new Error("INVALID_MESSAGE_CURSOR");
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error("INVALID_MESSAGE_LIMIT");
    return this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [input.workspace.workspaceId]);
      const rows = cursor
        ? await query.query<MessageRow>(
          `SELECT id, role, body, created_at FROM aicp.conversation_messages
           WHERE workspace_id=$1 AND conversation_id=$2 AND (created_at, id) > ($3::timestamptz, $4::uuid)
           ORDER BY created_at, id LIMIT $5`, [input.workspace.workspaceId, input.conversationId, cursor.timestamp, cursor.id, input.limit])
        : await query.query<MessageRow>(
          `SELECT id, role, body, created_at FROM aicp.conversation_messages
           WHERE workspace_id=$1 AND conversation_id=$2 ORDER BY created_at, id LIMIT $3`, [input.workspace.workspaceId, input.conversationId, input.limit]);
      const messages = rows.rows.filter((row) => row.role === "staff").map((row) => Object.freeze({ id: row.id, text: row.body, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString() }));
      const latest = rows.rows.at(-1);
      return Object.freeze({ messages, cursor: latest ? cursorEncode(latest) : input.after });
    });
  }
}
