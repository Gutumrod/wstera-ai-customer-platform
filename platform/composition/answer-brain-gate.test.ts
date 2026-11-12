import assert from "node:assert/strict";
import test from "node:test";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import { createExtractiveAnswerabilityPort } from "../adapters/answers/extractive/extractive-answerability-port.js";
import { callWithOneRetry, isProviderFault, ModelAdapterError } from "../adapters/models/openai-compatible/chat-completions.js";
import { areKnowledgeCitationsCurrent, createFaqVersion, KnowledgeRetriever } from "../modules/knowledge/index.js";
import { InMemoryKnowledgeRepository } from "../modules/knowledge/testing/in-memory-repository.js";
import { InMemoryConversationRepository } from "../modules/conversation/testing/in-memory-repository.js";
import { createAnswerBrain, type AnswerBrainDeps } from "./answer-brain.js";
import type { ChatHistoryItem } from "../modules/ai-engine/support-orchestrator.js";

const workspace: TrustedWorkspaceContext = Object.freeze({ workspaceId: "shop-1", connectionId: "conn-gate", channel: "web" });

function createBrain(extra: Partial<AnswerBrainDeps>, handoffs: string[] = []) {
  const knowledge = new InMemoryKnowledgeRepository();
  knowledge.createSource(workspace, { sourceId: "faq-return", title: "นโยบายการคืนสินค้า", kind: "faq" });
  knowledge.createVersion(workspace, createFaqVersion({
    workspace, sourceId: "faq-return", versionId: "v1", title: "นโยบายการคืนสินค้า",
    content: "เปลี่ยนคืนสินค้าได้ภายใน 7 วันหลังรับสินค้า", createdAt: "2026-01-01T00:00:00.000Z", visibility: "customer",
  }));
  for (const status of ["validating", "extracting", "indexed"] as const) knowledge.transitionVersion(workspace, "faq-return", "v1", status);
  knowledge.approveVersion(workspace, "faq-return", "v1", { approvedBy: "synthetic-owner", approvedAt: "2026-01-01T00:01:00.000Z" });
  return createAnswerBrain({
    conversations: new InMemoryConversationRepository(),
    retrieval: new KnowledgeRetriever(knowledge),
    evidenceFreshness: { areCurrentAndApproved: (context, citations, audience) => areKnowledgeCitationsCurrent(knowledge, context, citations, audience) },
    answerability: createExtractiveAnswerabilityPort(),
    handoff: { async request(input) { handoffs.push(input.reason); } },
    now: () => "2026-11-12T00:00:00.000Z",
    ...extra,
  });
}

test("gate partially_answerable reaches the model answer port with history", async () => {
  const history: ChatHistoryItem[] = [{ role: "customer", text: "คืนสินค้าได้ไหม" }];
  let gateHistory: unknown;
  let answerHistory: unknown;
  const brain = createBrain({
    model: { enabled: true, createModelPort: () => ({ async generate(input) {
      answerHistory = input.history;
      return { text: "คืนได้ภายใน 7 วันครับ ส่วนค่าส่งคืนยังไม่มีข้อมูลในระบบ ให้พนักงานช่วยตรวจสอบได้ครับ", citationRefs: ["evidence-1"] };
    } }) },
    broadRetrieval: async () => [],
    modelGate: async (input) => { gateHistory = input.history; return { kind: "partially_answerable" }; },
  });
  const reply = await brain.respond({ workspace, conversationId: "c-partial", query: "คืนสินค้ากี่วัน และค่าส่งคืนเท่าไหร่", history });
  assert.equal(reply.kind, "answer");
  assert.deepEqual(gateHistory, history);
  assert.deepEqual(answerHistory, history);
});

test("model outage serves an extractive answer when evidence supports it and never opens a handoff", async () => {
  const handoffs: string[] = [];
  const brain = createBrain({ broadRetrieval: async () => [], modelGate: async () => ({ kind: "model_unavailable" }) }, handoffs);
  const reply = await brain.respond({ workspace, conversationId: "c-out-1", query: "คืนสินค้าได้ภายในกี่วัน" });
  assert.equal(reply.kind, "answer");
  assert.deepEqual(handoffs, []);
});

test("model outage with nothing answerable reports model_unavailable, not no-information, and requests no handoff", async () => {
  const handoffs: string[] = [];
  const brain = createBrain({ broadRetrieval: async () => [], modelGate: async () => ({ kind: "model_unavailable" }) }, handoffs);
  const reply = await brain.respond({ workspace, conversationId: "c-out-2", query: "มีสีอะไรบ้าง" });
  assert.deepEqual(reply, { kind: "model_unavailable" });
  assert.deepEqual(handoffs, []);
});

test("retry helper tries provider faults exactly twice and other errors once", async () => {
  let calls = 0;
  assert.equal(await callWithOneRetry(async () => { if (++calls === 1) throw new ModelAdapterError("TIMEOUT"); return "ok"; }), "ok");
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(callWithOneRetry(async () => { calls++; throw new ModelAdapterError("HTTP_ERROR", 503); }));
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(callWithOneRetry(async () => { calls++; throw new ModelAdapterError("INVALID_PROVIDER_RESPONSE"); }));
  assert.equal(calls, 1);
  assert.equal(isProviderFault(new ModelAdapterError("HTTP_ERROR", 400)), false);
  assert.equal(isProviderFault(new ModelAdapterError("HTTP_ERROR", 429)), true);
});

test("web host passes the last turns as history to the gate and survives a failing history read", async () => {
  const { createWebChatHost } = await import("./web-chat-host.js");
  const turns = [{ role: "customer" as const, text: "ราคาเท่าไหร่" }, { role: "assistant" as const, text: "100 บาทครับ" }];
  const failing = async () => { throw new Error("db down"); };
  for (const readTurns of [async () => turns, failing]) {
    let seen: unknown = "unset";
    const knowledge = new InMemoryKnowledgeRepository();
    const host = createWebChatHost({
      conversations: new InMemoryConversationRepository(),
      retrieval: new KnowledgeRetriever(knowledge),
      evidenceFreshness: { areCurrentAndApproved: async () => true },
      answerability: createExtractiveAnswerabilityPort(),
      handoff: { async request() {} },
      messages: { async appendTurn() {}, async staffUpdates() { return { messages: [], cursor: null }; }, recentTurns: readTurns },
      broadRetrieval: async () => [],
      modelGate: async (input) => { seen = input.history; return { kind: "small_talk" }; },
    });
    const reply = await host.responder({ workspace, conversationId: "c-hist", query: "แล้วอันนั้นล่ะ", audience: "customer" });
    assert.equal(reply.kind, "small_talk");
    assert.deepEqual(seen, readTurns === failing ? undefined : turns);
  }
});
