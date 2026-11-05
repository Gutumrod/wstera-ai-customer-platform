import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createTrustedWorkspace } from "../modules/tenancy/workspace.js";
import { OWNER_B, STAFF_A, createMigratedDatabase, runtimePort } from "./testing/merchant-host-harness.js";
import { HandoffService } from "./handoff-service.js";
import { PostgresConversationRepository } from "../adapters/persistence/postgres/conversation-repository.js";
import { PostgresSupportHandoff } from "../adapters/persistence/postgres/support-handoff.js";

const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
const shopB = createTrustedWorkspace({ workspaceId: "shop-b", connectionId: "web-b", channel: "web" });
let database: PGlite;
let service: HandoffService;
let conversations: PostgresConversationRepository;

before(async () => {
  database = await createMigratedDatabase();
  const port = runtimePort(database);
  service = new HandoffService(port);
  conversations = new PostgresConversationRepository(port);
});
after(async () => { await database.close(); });

test("list returns latest customer text capped at 120 characters, null when absent, and only the trusted workspace rows", async () => {
  await conversations.create(shopA, "thread-with-customer", "2026-11-01T00:00:00.000Z");
  await conversations.create(shopA, "thread-without-customer", "2026-11-02T00:00:00.000Z");
  await conversations.create(shopB, "private-thread", "2026-11-03T00:00:00.000Z");
  const handoff = new PostgresSupportHandoff(runtimePort(database));
  await handoff.request({ workspace: shopA, conversationId: "thread-with-customer", reason: "NO_APPROVED_EVIDENCE" });
  await handoff.request({ workspace: shopA, conversationId: "thread-without-customer", reason: "NO_APPROVED_EVIDENCE" });
  await handoff.request({ workspace: shopB, conversationId: "private-thread", reason: "NO_APPROVED_EVIDENCE" });

  const longText = "คำถามล่าสุด".repeat(20);
  const port = runtimePort(database);
  await port.transaction(async (query) => {
    await query.query("SELECT set_config('app.workspace_id', $1, true)", [shopA.workspaceId]);
    await query.query(
      "INSERT INTO aicp.conversation_messages (workspace_id, conversation_id, role, body, created_at) VALUES ($1, $2, 'customer', $3, $4)",
      [shopA.workspaceId, "thread-with-customer", "ข้อความเก่า", "2026-11-04T00:00:00.000Z"]);
    await query.query(
      "INSERT INTO aicp.conversation_messages (workspace_id, conversation_id, role, body, created_at) VALUES ($1, $2, 'bot', $3, $4)",
      [shopA.workspaceId, "thread-with-customer", "บอทตอบหลังลูกค้า", "2026-11-04T00:01:00.000Z"]);
    await query.query(
      "INSERT INTO aicp.conversation_messages (workspace_id, conversation_id, role, body, created_at) VALUES ($1, $2, 'customer', $3, $4)",
      [shopA.workspaceId, "thread-with-customer", longText, "2026-11-04T00:02:00.000Z"]);
  });

  const statements: string[] = [];
  const listed = await new HandoffService(runtimePort(database, statements)).list(shopA, STAFF_A);
  const listingQueries = statements.filter((sql) => sql.includes("FROM aicp.conversations AS c"));
  assert.equal(listingQueries.length, 1);
  assert.match(listingQueries[0]!, /LEFT JOIN LATERAL/u);
  const withCustomer = listed.find((item) => item.conversationId === "thread-with-customer");
  const withoutCustomer = listed.find((item) => item.conversationId === "thread-without-customer");
  assert.equal(withCustomer?.lastCustomerMessage, longText.slice(0, 120));
  assert.equal(withCustomer?.lastCustomerMessage?.length, 120);
  assert.equal(withoutCustomer?.lastCustomerMessage, null);
  assert.equal(listed.some((item) => item.conversationId === "private-thread"), false);
  assert.equal((await service.list(shopB, OWNER_B)).some((item) => item.conversationId === "thread-with-customer"), false);
});
