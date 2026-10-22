import assert from "node:assert/strict";
import { test } from "node:test";
import { createTrustedWorkspace } from "../tenancy/workspace.js";
import {
  ConversationError,
  canSendAiReply,
  claimHandoff,
  createConversation,
  recordStaffReplyDelivery,
  releaseHandoff,
  requestHandoff,
  type StaffAuthorizationPort,
} from "../conversation/index.js";
import { InMemoryConversationRepository } from "../conversation/testing/in-memory-repository.js";

const workspace = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });

function authorization(overrides: Partial<StaffAuthorizationPort> = {}): StaffAuthorizationPort {
  return {
    assertCanClaim: async () => undefined,
    assertCanReply: async () => undefined,
    assertCanRelease: async () => undefined,
    ...overrides,
  };
}

test("new conversation starts with AI enabled and tenant-scoped identity", async () => {
  const repository = new InMemoryConversationRepository();
  const conversation = await createConversation(repository, workspace, "thread-1");
  assert.equal(conversation.workspaceId, workspace.workspaceId);
  assert.equal(conversation.conversationId, "thread-1");
  assert.equal(conversation.status, "ai_active");
  assert.equal(canSendAiReply(conversation), true);
});

test("handoff request pauses AI before operator claim and staff reply keeps it paused", async () => {
  const repository = new InMemoryConversationRepository();
  await createConversation(repository, workspace, "thread-2");
  const waiting = await requestHandoff(repository, workspace, "thread-2", "no_answer");
  assert.equal(waiting.status, "handoff_requested");
  assert.equal(canSendAiReply(waiting), false);

  const active = await claimHandoff(repository, authorization(), workspace, "thread-2", "staff-1");
  assert.equal(active.status, "human_active");
  assert.equal(active.assignedStaffId, "staff-1");
  const replied = await recordStaffReplyDelivery(repository, authorization(), workspace, "thread-2", "staff-1", "delivery-1");
  assert.equal(replied.status, "human_active");
  assert.equal(canSendAiReply(replied), false);
  const repeated = await recordStaffReplyDelivery(repository, authorization(), workspace, "thread-2", "staff-1", "delivery-1");
  assert.equal(repeated.version, replied.version);
  assert.equal(repeated.lastStaffDeliveryId, "delivery-1");
  const second = await recordStaffReplyDelivery(repository, authorization(), workspace, "thread-2", "staff-1", "delivery-2");
  const oldRetry = await recordStaffReplyDelivery(repository, authorization(), workspace, "thread-2", "staff-1", "delivery-1");
  assert.equal(oldRetry.version, second.version + 1);
  const concurrent = await Promise.all([
    recordStaffReplyDelivery(repository, authorization(), workspace, "thread-2", "staff-1", "delivery-3"),
    recordStaffReplyDelivery(repository, authorization(), workspace, "thread-2", "staff-1", "delivery-3"),
  ]);
  assert.equal(concurrent[0].version, concurrent[1].version);
  assert.equal(concurrent[0].version, oldRetry.version + 1);
});

test("replaying the latest delivery returns the post-transition repository snapshot", async () => {
  const repository = new InMemoryConversationRepository();
  await createConversation(repository, workspace, "thread-replay-race");
  await requestHandoff(repository, workspace, "thread-replay-race", "no_answer");
  await claimHandoff(repository, authorization(), workspace, "thread-replay-race", "staff-1");
  const delivered = await recordStaffReplyDelivery(repository, authorization(), workspace, "thread-replay-race", "staff-1", "delivery-latest");
  const releaseDuringAuthorization = authorization({ assertCanReply: async () => {
    const latest = await repository.load(workspace, "thread-replay-race");
    assert.ok(latest);
    await repository.append(workspace, "thread-replay-race", latest.version, {
      kind: "handoff_released", staffId: "staff-1", occurredAt: new Date().toISOString(),
    });
  } });
  const replay = await recordStaffReplyDelivery(repository, releaseDuringAuthorization, workspace, "thread-replay-race", "staff-1", "delivery-latest");
  const latest = await repository.load(workspace, "thread-replay-race");
  assert.ok(latest);
  assert.ok(replay.version > delivered.version);
  assert.equal(replay.status, "ai_active");
  assert.equal(replay.version, latest.version);
});

test("customer-facing calls cannot release handoff and unauthorized staff cannot release it", async () => {
  const repository = new InMemoryConversationRepository();
  await createConversation(repository, workspace, "thread-3");
  await requestHandoff(repository, workspace, "thread-3", "customer_requested");
  await claimHandoff(repository, authorization(), workspace, "thread-3", "staff-1");

  const denied = authorization({ assertCanRelease: async () => { throw new ConversationError("UNAUTHORIZED_OPERATOR"); } });
  await assert.rejects(
    () => releaseHandoff(repository, denied, workspace, "thread-3", "staff-1"),
    (error: unknown) => error instanceof ConversationError && error.code === "UNAUTHORIZED_OPERATOR",
  );
  assert.equal((await repository.load(workspace, "thread-3"))?.status, "human_active");
});

test("authorized staff release is the only transition that resumes AI", async () => {
  const repository = new InMemoryConversationRepository();
  await createConversation(repository, workspace, "thread-4");
  await requestHandoff(repository, workspace, "thread-4", "conflicting_evidence");
  await claimHandoff(repository, authorization(), workspace, "thread-4", "staff-2");

  const resumed = await releaseHandoff(repository, authorization(), workspace, "thread-4", "staff-2");
  assert.equal(resumed.status, "ai_active");
  assert.equal(resumed.assignedStaffId, undefined);
  assert.equal(canSendAiReply(resumed), true);
});

test("handoff commands reject a forged workspace and an active conversation cannot be claimed", async () => {
  const repository = new InMemoryConversationRepository();
  await createConversation(repository, workspace, "thread-5");
  const otherWorkspace = createTrustedWorkspace({ workspaceId: "shop-b", connectionId: "web-b", channel: "web" });
  await assert.rejects(() => requestHandoff(repository, otherWorkspace, "thread-5", "no_answer"), /CONVERSATION_NOT_FOUND/);
  await assert.rejects(
    () => claimHandoff(repository, authorization(), workspace, "thread-5", "staff-1"),
    (error: unknown) => error instanceof ConversationError && error.code === "INVALID_TRANSITION",
  );
});

test("handoff failures are explicit and invalid transition requests fail closed", async () => {
  const repository = new InMemoryConversationRepository();
  await createConversation(repository, workspace, "thread-6");
  const first = await requestHandoff(repository, workspace, "thread-6", "no_answer");
  const repeated = await requestHandoff(repository, workspace, "thread-6", "no_answer");
  assert.equal(repeated.version, first.version);
  await assert.rejects(
    () => requestHandoff(repository, workspace, "thread-6", "customer_requested"),
    (error: unknown) => error instanceof ConversationError && error.code === "INVALID_TRANSITION",
  );
});

test("repository compare-and-append rejects a stale transition version", async () => {
  const repository = new InMemoryConversationRepository();
  await createConversation(repository, workspace, "thread-7");
  await requestHandoff(repository, workspace, "thread-7", "no_answer");
  await assert.rejects(
    () => repository.append(workspace, "thread-7", 0, {
      kind: "operator_claimed",
      staffId: "staff-1",
      occurredAt: "2026-01-01T00:00:00.000Z",
    }),
    (error: unknown) => error instanceof ConversationError && error.code === "VERSION_CONFLICT",
  );
});
