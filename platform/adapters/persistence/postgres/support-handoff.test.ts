import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";
import { createMigratedDatabase, runtimePort } from "../../../composition/testing/merchant-host-harness.js";
import { PostgresConversationRepository } from "./conversation-repository.js";
import { PostgresSupportHandoff } from "./support-handoff.js";

const workspace = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
let database: PGlite;
before(async () => { database = await createMigratedDatabase(); });
after(async () => { await database.close(); });

test("handoff state, immutable event, and one pending notification are committed together", async () => {
  const port = runtimePort(database);
  await new PostgresConversationRepository(port).create(workspace, "thread-outbox");
  const handoff = new PostgresSupportHandoff(port);
  const request = { workspace, conversationId: "thread-outbox", reason: "CONFLICTING_EVIDENCE" as const };
  await handoff.request(request);
  await handoff.request(request);

  const state = await new PostgresConversationRepository(port).load(workspace, "thread-outbox");
  assert.equal(state?.status, "handoff_requested");
  assert.equal(state?.handoffReason, "conflicting_evidence");
  const rows = await database.query<{ events: number; notifications: number; reason: string }>(
    `SELECT (SELECT count(*)::int FROM aicp.conversation_events WHERE workspace_id = 'shop-a' AND conversation_id = 'thread-outbox') AS events,
            (SELECT count(*)::int FROM aicp.handoff_notifications WHERE workspace_id = 'shop-a' AND conversation_id = 'thread-outbox') AS notifications,
            (SELECT reason FROM aicp.handoff_notifications WHERE workspace_id = 'shop-a' AND conversation_id = 'thread-outbox') AS reason`);
  assert.deepEqual(rows.rows[0], { events: 1, notifications: 1, reason: "conflicting_evidence" });
});
