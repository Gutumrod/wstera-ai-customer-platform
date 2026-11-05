import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";
import { ConversationError } from "../../../modules/conversation/index.js";
import { createMigratedDatabase, runtimePort } from "../../../composition/testing/merchant-host-harness.js";
import { PostgresConversationRepository } from "./conversation-repository.js";
import { PostgresConversationMessages } from "./conversation-messages.js";

const workspace = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
let database: PGlite;
before(async () => { database = await createMigratedDatabase(); });
after(async () => { await database.close(); });

test("Postgres conversation repository persists state across adapter recreation and rejects stale versions", async () => {
  const firstProcess = new PostgresConversationRepository(runtimePort(database));
  const created = await firstProcess.create(workspace, "thread-durable", "2026-11-05T00:00:00.000Z");
  const waiting = await firstProcess.append(workspace, created.conversationId, 0, {
    kind: "handoff_requested", reason: "no_answer", occurredAt: "2026-11-05T00:01:00.000Z",
  });
  assert.equal(waiting.status, "handoff_requested");

  const restartedProcess = new PostgresConversationRepository(runtimePort(database));
  assert.deepEqual(await restartedProcess.load(workspace, created.conversationId), waiting);
  await assert.rejects(restartedProcess.append(workspace, created.conversationId, 0, {
    kind: "operator_claimed", staffId: "staff-a", occurredAt: "2026-11-05T00:02:00.000Z",
  }), (error: unknown) => error instanceof ConversationError && error.code === "VERSION_CONFLICT");
  const active = await restartedProcess.append(workspace, created.conversationId, 1, {
    kind: "operator_claimed", staffId: "staff-a", occurredAt: "2026-11-05T00:02:00.000Z",
  });
  assert.equal(active.status, "human_active");
  const events = await database.query<{ count: number }>("SELECT count(*)::int AS count FROM aicp.conversation_events WHERE workspace_id = 'shop-a' AND conversation_id = 'thread-durable'");
  assert.equal(events.rows[0]?.count, 2);
});

test("conversation message turns persist and customer updates reveal only staff messages with a moving cursor", async () => {
  await new PostgresConversationRepository(runtimePort(database)).create(workspace, "thread-messages");
  const messages = new PostgresConversationMessages(runtimePort(database));
  await messages.appendTurn({ workspace, conversationId: "thread-messages", customerText: "คำถาม", botText: "ขออภัย แจ้งพนักงานแล้ว" });
  await database.query("INSERT INTO aicp.conversation_messages (workspace_id, conversation_id, role, body, staff_id, created_at) VALUES ('shop-a','thread-messages','staff','พนักงานตอบ','staff-a','2999-01-01T00:00:00Z')");
  const first = await messages.staffUpdates({ workspace, conversationId: "thread-messages", after: null, limit: 100 });
  assert.equal(first.messages.length, 1);
  assert.equal(first.messages[0]?.text, "พนักงานตอบ");
  assert.ok(first.cursor);
  await database.query("INSERT INTO aicp.conversation_messages (workspace_id, conversation_id, role, body, staff_id, created_at) VALUES ('shop-a','thread-messages','staff','คำตอบใหม่','staff-a','2999-01-02T00:00:00Z')");
  const next = await messages.staffUpdates({ workspace, conversationId: "thread-messages", after: first.cursor, limit: 100 });
  assert.deepEqual(next.messages.map((item) => item.text), ["คำตอบใหม่"]);
});
