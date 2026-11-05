import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";
import { ConversationError } from "../../../modules/conversation/index.js";
import { createMigratedDatabase, runtimePort } from "../../../composition/testing/merchant-host-harness.js";
import { PostgresConversationRepository } from "./conversation-repository.js";

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
