import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";
import { OWNER_B, STAFF_A, createMigratedDatabase, runtimePort } from "../../../composition/testing/merchant-host-harness.js";
import { HandoffService, HandoffServiceError } from "../../../composition/handoff-service.js";
import { PostgresConversationRepository } from "./conversation-repository.js";
import { PostgresSupportHandoff } from "./support-handoff.js";

const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
const shopB = createTrustedWorkspace({ workspaceId: "shop-b", connectionId: "web-b", channel: "web" });
let database: PGlite;
let service: HandoffService;
let conversations: PostgresConversationRepository;
before(async () => { database = await createMigratedDatabase(); const port = runtimePort(database); service = new HandoffService(port); conversations = new PostgresConversationRepository(port); });
after(async () => { await database.close(); });

test("member can claim, reply once by delivery id, and release; replies from AI-active return conflict", async () => {
  await conversations.create(shopA, "thread-staff");
  await assert.rejects(service.reply(shopA, STAFF_A, "thread-staff", "ตอบก่อนส่งต่อ", "delivery-active"),
    (error: unknown) => error instanceof HandoffServiceError && error.code === "AI_ACTIVE");
  await new PostgresSupportHandoff(runtimePort(database)).request({ workspace: shopA, conversationId: "thread-staff", reason: "NO_APPROVED_EVIDENCE" });
  const claimed = await service.claim(shopA, STAFF_A, "thread-staff");
  assert.equal(claimed.status, "human_active");
  const first = await service.reply(shopA, STAFF_A, "thread-staff", "สวัสดีครับ", "delivery-unique");
  const retry = await service.reply(shopA, STAFF_A, "thread-staff", "สวัสดีครับ", "delivery-unique");
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal((await service.messages(shopA, STAFF_A, "thread-staff")).length, 1);
  const released = await service.release(shopA, STAFF_A, "thread-staff");
  assert.equal(released.status, "ai_active");
});

test("reply from handoff_requested claims and replies atomically without exposing another workspace", async () => {
  await conversations.create(shopA, "thread-direct-reply");
  await new PostgresSupportHandoff(runtimePort(database)).request({ workspace: shopA, conversationId: "thread-direct-reply", reason: "NO_APPROVED_EVIDENCE" });
  const result = await service.reply(shopA, STAFF_A, "thread-direct-reply", "รับเรื่องแล้ว", "delivery-direct");
  assert.equal(result.duplicate, false);
  const state = await conversations.load(shopA, "thread-direct-reply");
  assert.equal(state?.status, "human_active");
  assert.equal(state?.version, 3);

  await conversations.create(shopB, "thread-private");
  const nonMember = "00000000-0000-0000-0000-0000000000ff";
  const denied = (code: string) => (error: unknown) => error instanceof HandoffServiceError && error.code === code;
  for (const action of [
    () => service.claim(shopB, OWNER_B, "thread-direct-reply"),
    () => service.reply(shopB, OWNER_B, "thread-direct-reply", "forged", "delivery-outsider"),
    () => service.release(shopB, OWNER_B, "thread-direct-reply"),
  ]) await assert.rejects(action, denied("CONVERSATION_NOT_FOUND"));
  for (const action of [
    () => service.claim(shopA, nonMember, "thread-direct-reply"),
    () => service.reply(shopA, nonMember, "thread-direct-reply", "forged", "delivery-nonmember"),
    () => service.release(shopA, nonMember, "thread-direct-reply"),
  ]) await assert.rejects(action, denied("MEMBERSHIP_REQUIRED"));
  const unchanged = await conversations.load(shopA, "thread-direct-reply");
  assert.equal(unchanged?.status, "human_active");
  assert.equal(unchanged?.version, 3);
});
