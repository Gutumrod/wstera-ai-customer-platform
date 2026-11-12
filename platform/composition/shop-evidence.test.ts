import assert from "node:assert/strict";
import test from "node:test";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import type { SupportEvidence } from "../modules/ai-engine/support-orchestrator.js";
import { createExtractiveAnswerabilityPort } from "../adapters/answers/extractive/extractive-answerability-port.js";
import { areKnowledgeCitationsCurrent, KnowledgeRetriever } from "../modules/knowledge/index.js";
import { InMemoryKnowledgeRepository } from "../modules/knowledge/testing/in-memory-repository.js";
import { InMemoryShopKnowledgeRepository } from "../modules/knowledge/testing/in-memory-shop-repository.js";
import { InMemoryConversationRepository } from "../modules/conversation/testing/in-memory-repository.js";
import { createAnswerBrain } from "./answer-brain.js";
import { describeShopCitations, withShopEvidence, withShopFreshness } from "./shop-evidence.js";

const workspace: TrustedWorkspaceContext = Object.freeze({ workspaceId: "shop-1", connectionId: "conn-shop", channel: "web" });
const stamp = "2026-11-12T00:00:00.000Z";

function setup() {
  const shop = new InMemoryShopKnowledgeRepository();
  shop.createProfileVersion(workspace, { versionId: "p1", createdAt: stamp, profile: {
    shopName: "ร้านทดสอบ", address: "99 ถนนตัวอย่าง เชียงใหม่", hours: [{ days: "จันทร์-ศุกร์", hours: "09:00-18:00" }],
    contacts: [{ channel: "line", value: "@testshop" }], policies: { returns: "คืนได้ใน 7 วัน" } } });
  shop.approveProfileVersion(workspace, "p1", { approvedBy: "owner", approvedAt: stamp });
  shop.createCatalogItemVersion(workspace, { versionId: "c1", createdAt: stamp, item: {
    sku: "RK-XMAX-01", name: "แร็คท้าย XMAX", fitments: ["Yamaha XMAX ปี 2018-2024"], priceThb: 2990, stockStatus: "in_stock" } });
  shop.approveCatalogItemVersion(workspace, "RK-XMAX-01", "c1", { approvedBy: "owner", approvedAt: stamp });
  const documents = new InMemoryKnowledgeRepository();
  const evidenceFreshness = withShopFreshness({ areCurrentAndApproved: (w, c, a) => areKnowledgeCitationsCurrent(documents, w, c, a) }, shop);
  // Fake model: answers with the evidence item that contains `marker`, citing it; never a real provider.
  const modelAnswering = (marker: string) => () => ({ async generate(input: Readonly<{ evidence: readonly SupportEvidence[] }>) {
    const item = input.evidence.find((e) => e.text.includes(marker));
    return item ? { text: item.text, citationRefs: [item.referenceId] } : { text: "", citationRefs: [] };
  } });
  const brainFor = (marker: string) => createAnswerBrain({
    conversations: new InMemoryConversationRepository(),
    retrieval: withShopEvidence(new KnowledgeRetriever(documents), shop),
    evidenceFreshness, answerability: createExtractiveAnswerabilityPort(), handoff: { async request() {} },
    model: { enabled: true, createModelPort: modelAnswering(marker) },
    broadRetrieval: async () => [], modelGate: async () => ({ kind: "answerable" }), now: () => stamp,
  });
  return { shop, brainFor, evidenceFreshness };
}

test("profile answers an address question with a citation that names the shop info", async () => {
  const { shop, brainFor } = setup();
  const reply = await brainFor("99 ถนนตัวอย่าง").respond({ workspace, conversationId: "c-addr", query: "ร้านอยู่ที่ไหน" });
  assert.equal(reply.kind, "answer");
  if (reply.kind !== "answer") return;
  assert.match(reply.text, /99 ถนนตัวอย่าง เชียงใหม่/u);
  assert.equal(reply.citations[0]?.sourceId, "shop:profile");
  assert.deepEqual(await describeShopCitations(shop, workspace, reply.citations), [{ title: "ข้อมูลร้าน" }]);
});

test("catalog row answers a price question as a whole row, cited by product name", async () => {
  const { shop, brainFor } = setup();
  const reply = await brainFor("2,990").respond({ workspace, conversationId: "c-price", query: "แร็คท้าย XMAX ราคาเท่าไหร่" });
  assert.equal(reply.kind, "answer");
  if (reply.kind !== "answer") return;
  assert.match(reply.text, /RK-XMAX-01/u);
  assert.match(reply.text, /2,990 บาท/u);
  assert.match(reply.text, /Yamaha XMAX ปี 2018-2024/u);
  assert.equal(reply.citations[0]?.sourceId, "shop:catalog:RK-XMAX-01");
  assert.deepEqual(await describeShopCitations(shop, workspace, reply.citations), [{ title: "แร็คท้าย XMAX" }]);
});

test("a changed or revoked shop version is no longer current and the answer is not served", async () => {
  const { shop, brainFor, evidenceFreshness } = setup();
  const retrieval = withShopEvidence(new KnowledgeRetriever(new InMemoryKnowledgeRepository()), shop);
  const found = await retrieval.search({ workspace, query: "แร็คท้าย XMAX ราคาเท่าไหร่", limit: 5, audience: "customer" });
  assert.equal(found.kind, "evidence");
  const citations = found.kind === "evidence" ? found.hits.map((h) => h.citation) : [];
  assert.equal(await evidenceFreshness.areCurrentAndApproved(workspace, citations, "customer"), true);
  shop.revokeCatalogItemVersion(workspace, "RK-XMAX-01", "c1", { revokedBy: "owner", reason: "test" });
  assert.equal(await evidenceFreshness.areCurrentAndApproved(workspace, citations, "customer"), false);
  const reply = await brainFor("2,990").respond({ workspace, conversationId: "c-stale", query: "แร็คท้าย XMAX ราคาเท่าไหร่" });
  assert.notEqual(reply.kind, "answer");
});

test("search never returns more hits than the caller's limit", async () => {
  const { shop } = setup();
  const retrieval = withShopEvidence(new KnowledgeRetriever(new InMemoryKnowledgeRepository()), shop);
  const found = await retrieval.search({ workspace, query: "แร็คท้าย XMAX", limit: 1, audience: "customer" });
  assert.equal(found.kind === "evidence" ? found.hits.length : -1, 1);
});
