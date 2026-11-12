import assert from "node:assert/strict";
import test from "node:test";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import { createExtractiveAnswerabilityPort } from "../adapters/answers/extractive/extractive-answerability-port.js";
import { areKnowledgeCitationsCurrent, createFaqVersion, KnowledgeRetriever } from "../modules/knowledge/index.js";
import { InMemoryKnowledgeRepository } from "../modules/knowledge/testing/in-memory-repository.js";
import { InMemoryConversationRepository } from "../modules/conversation/testing/in-memory-repository.js";
import { createAnswerBrain } from "./answer-brain.js";

const workspace: TrustedWorkspaceContext = Object.freeze({ workspaceId: "shop-1", connectionId: "conn-brain", channel: "web" });

function createBrain() {
  const knowledge = new InMemoryKnowledgeRepository();
  knowledge.createSource(workspace, { sourceId: "faq-return", title: "นโยบายการคืนสินค้า", kind: "faq" });
  const version = createFaqVersion({
    workspace,
    sourceId: "faq-return",
    versionId: "v1",
    title: "นโยบายการคืนสินค้า",
    content: "เปลี่ยนคืนสินค้าได้ภายใน 7 วันหลังรับสินค้า",
    createdAt: "2026-01-01T00:00:00.000Z",
    visibility: "customer",
  });
  knowledge.createVersion(workspace, version);
  for (const status of ["validating", "extracting", "indexed"] as const) {
    knowledge.transitionVersion(workspace, "faq-return", "v1", status);
  }
  knowledge.approveVersion(workspace, "faq-return", "v1", { approvedBy: "synthetic-owner", approvedAt: "2026-01-01T00:01:00.000Z" });
  return createAnswerBrain({
    conversations: new InMemoryConversationRepository(),
    retrieval: new KnowledgeRetriever(knowledge),
    evidenceFreshness: { areCurrentAndApproved: (context, citations, audience) => areKnowledgeCitationsCurrent(knowledge, context, citations, audience) },
    answerability: createExtractiveAnswerabilityPort(),
    handoff: { async request() {} },
    now: () => "2026-11-04T00:00:00.000Z",
  });
}

test("answer brain responds to a greeting directly without a channel host", async () => {
  const brain = createBrain();
  const reply = await brain.respond({ workspace, conversationId: "conversation-greeting", query: "สวัสดีครับ" });
  assert.deepEqual(reply, { kind: "small_talk", text: "สวัสดีครับ มีอะไรให้ช่วยสอบถามได้เลยครับ" });
});

test("answer brain answers a question from approved supporting knowledge directly", async () => {
  const brain = createBrain();
  const reply = await brain.respond({ workspace, conversationId: "conversation-answer", query: "คืนสินค้าได้ภายในกี่วัน" });
  assert.equal(reply.kind, "answer");
  if (reply.kind === "answer") {
    assert.match(reply.text, /เปลี่ยนคืนสินค้าได้ภายใน 7 วัน/u);
    assert.ok(reply.citations.length > 0);
  }
});
