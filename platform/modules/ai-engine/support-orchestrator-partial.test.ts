import assert from "node:assert/strict";
import test from "node:test";
import { SupportOrchestrator } from "./support-orchestrator.js";

test("partially answerable assessment proceeds to grounded generation and forwards history", async () => {
  const workspace = { workspaceId: "shop-a", connectionId: "web-a", channel: "web" as const };
  const hit = { sourceId: "faq", versionId: "v1", title: "FAQ", text: "จัดส่ง 2 วัน", score: 1,
    citation: { workspaceId: "shop-a", sourceId: "faq", sourceVersionId: "v1", chunkId: "c1", locator: { kind: "chunk" as const, chunkIndex: 0 } } };
  const history = [{ role: "customer" as const, text: "ขอทราบการจัดส่ง" }];
  let assessedHistory: unknown;
  let generatedHistory: unknown;
  const orchestrator = new SupportOrchestrator({
    conversations: { async load() { return { workspaceId: "shop-a", conversationId: "conv-a", status: "ai_active" as const, version: 1, createdAt: "now", updatedAt: "now" }; } },
    retrieval: { async search() { return { kind: "evidence" as const, hits: [hit] }; } },
    evidenceFreshness: { async areCurrentAndApproved() { return true; } },
    answerability: { async assess(input) { assessedHistory = input.history; return { kind: "partially_answerable" }; } },
    answer: { async generate(input) { generatedHistory = input.history; return { text: "จัดส่ง 2 วันครับ", citationRefs: ["evidence-1"] }; } },
    handoff: { async request() {} },
  });
  const reply = await orchestrator.respond({ workspace, conversationId: "conv-a", query: "ส่งกี่วัน และมีประกันไหม", audience: "customer", history });
  assert.equal(reply.kind, "answer");
  assert.deepEqual(assessedHistory, history);
  assert.deepEqual(generatedHistory, history);
});
