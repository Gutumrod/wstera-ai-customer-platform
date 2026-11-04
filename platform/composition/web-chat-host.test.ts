import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationRepositoryPort } from "../contracts/data/conversation.js";
import type { KnowledgeRetrievalHit, KnowledgeRetrievalQuery, KnowledgeRetrievalResult } from "../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import type { SupportHandoffReason } from "../modules/ai-engine/support-orchestrator.js";
import {
  areKnowledgeCitationsCurrent,
  createFaqVersion,
  KnowledgeRetriever,
} from "../modules/knowledge/index.js";
import { InMemoryKnowledgeRepository } from "../modules/knowledge/testing/in-memory-repository.js";
import { InMemoryConversationRepository } from "../modules/conversation/testing/in-memory-repository.js";
import { createExtractiveAnswerabilityPort } from "../adapters/answers/extractive/extractive-answerability-port.js";
import { createWebChatRoutes } from "./web-chat-routes.js";
import { createWebChatHost, type WebChatHostDeps } from "./web-chat-host.js";
import {
  WEB_CHAT_COOKIE_NAME,
  issueWebChatSession,
  signSessionToken,
} from "./web-chat-session.js";

const SESSION_SECRET = "super-secret-key-at-least-32-bytes-long-for-hmac";
const ALLOWED_ORIGIN = "https://shop.example.com";
const FIXED_NOW = "2026-11-04T00:00:00.000Z";
const SHOP = "shop-1";

type SyntheticDocument = Readonly<{
  sourceId: string;
  title: string;
  text: string;
  visibility?: "customer" | "internal";
}>;

const documents: readonly SyntheticDocument[] = Object.freeze([
  { sourceId: "faq-return", title: "นโยบายการคืนสินค้า", text: "เปลี่ยนคืนสินค้าได้ภายใน 7 วันหลังรับสินค้า" },
  { sourceId: "faq-shipping", title: "เวลาจัดส่ง", text: "การจัดส่งใช้เวลา 2-3 วันทำการ และส่งฟรีเมื่อซื้อครบ 2,000 บาท" },
  { sourceId: "faq-price", title: "ราคา CERAMIC-77", text: "สินค้าเซรามิก CERAMIC-77 ราคา 900 บาท" },
  { sourceId: "faq-hours", title: "เวลาทำการ", text: "ร้านเปิดทุกวัน เวลา 09:00-18:00 น." },
  { sourceId: "faq-warranty", title: "การรับประกัน", text: "สินค้ารับประกัน 1 ปีเต็มนับจากวันที่ซื้อ" },
  { sourceId: "faq-payment", title: "วิธีชำระเงิน", text: "รับชำระด้วยบัตรเครดิตและโอนผ่านธนาคาร" },
  { sourceId: "faq-install", title: "บริการติดตั้ง", text: "มีบริการติดตั้งฟรีในเขตกรุงเทพมหานคร" },
  { sourceId: "faq-address", title: "ที่ตั้งร้าน", text: "ร้านตั้งอยู่ที่ถนนพระรามเก้า กรุงเทพฯ" },
  {
    sourceId: "internal-cost",
    title: "ต้นทุนและกำไร (ภายใน)",
    text: "ต้นทุนสินค้า CERAMIC-77 ราคาทุน 450 บาท กำไรขั้นต้น 50 เปอร์เซ็นต์",
    visibility: "internal",
  },
]);

function workspaceFor(connectionId: string): TrustedWorkspaceContext {
  return Object.freeze({ workspaceId: SHOP, connectionId, channel: "web" });
}

function addApprovedDocument(
  repository: InMemoryKnowledgeRepository,
  document: SyntheticDocument,
): void {
  repository.createSource(workspaceFor("conn-seed"), {
    sourceId: document.sourceId,
    title: document.title,
    kind: "faq",
  });
  const version = createFaqVersion({
    workspace: workspaceFor("conn-seed"),
    sourceId: document.sourceId,
    versionId: "v1",
    title: document.title,
    content: document.text,
    createdAt: "2026-01-01T00:00:00.000Z",
    visibility: document.visibility ?? "customer",
  });
  repository.createVersion(workspaceFor("conn-seed"), version);
  for (const status of ["validating", "extracting", "indexed"] as const) {
    repository.transitionVersion(workspaceFor("conn-seed"), document.sourceId, "v1", status);
  }
  repository.approveVersion(workspaceFor("conn-seed"), document.sourceId, "v1", {
    approvedBy: "synthetic-owner",
    approvedAt: "2026-01-01T00:01:00.000Z",
  });
}

type Harness = Readonly<{
  repository: InMemoryKnowledgeRepository;
  conversations: InMemoryConversationRepository;
  routes: ReturnType<typeof createWebChatRoutes>;
  createCalls: () => number;
  createdConversations: () => number;
  handoffReasons: readonly SupportHandoffReason[];
  host: ReturnType<typeof createWebChatHost>;
  openSession: (connectionId: string) => Readonly<{ cookie: string; conversationId: string }>;
  send: (connectionId: string, cookie: string, text: string) => Promise<Response>;
  sendHandoff: (connectionId: string, cookie: string) => Promise<Response>;
  load: (connectionId: string, conversationId: string) => ReturnType<InMemoryConversationRepository["load"]>;
}>;

type HarnessOptions = Readonly<{
  hostOverrides?: Partial<WebChatHostDeps>;
  retrieval?: WebChatHostDeps["retrieval"];
  /** Synthetic documents added to this harness only. */
  extraDocuments?: readonly SyntheticDocument[];
  /** Delays conversation creation so two concurrent first messages really race. */
  createDelayMs?: number;
}>;

function createHarness(options: HarnessOptions = {}): Harness {
  const repository = new InMemoryKnowledgeRepository();
  for (const document of [...documents, ...(options.extraDocuments ?? [])]) addApprovedDocument(repository, document);

  const baseConversations = new InMemoryConversationRepository();
  let createCalls = 0;
  let createdConversations = 0;
  const conversations: ConversationRepositoryPort = Object.freeze({
    async create(workspace: TrustedWorkspaceContext, conversationId: string, now?: string) {
      createCalls += 1;
      if (options.createDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.createDelayMs));
      }
      const snapshot = await baseConversations.create(workspace, conversationId, now);
      createdConversations += 1;
      return snapshot;
    },
    load: (workspace: TrustedWorkspaceContext, conversationId: string) =>
      baseConversations.load(workspace, conversationId),
    append: (
      workspace: TrustedWorkspaceContext,
      conversationId: string,
      expectedVersion: number,
      event: Parameters<ConversationRepositoryPort["append"]>[3],
    ) => baseConversations.append(workspace, conversationId, expectedVersion, event),
  });

  const handoffReasons: SupportHandoffReason[] = [];
  const retriever = new KnowledgeRetriever(repository);

  const host = createWebChatHost({
    conversations,
    retrieval: options.retrieval ?? retriever,
    evidenceFreshness: {
      areCurrentAndApproved: (workspace, citations, audience) =>
        areKnowledgeCitationsCurrent(repository, workspace, citations, audience),
    },
    answerability: createExtractiveAnswerabilityPort(),
    handoff: {
      async request({ reason }) {
        handoffReasons.push(reason);
      },
    },
    now: () => FIXED_NOW,
    ...options.hostOverrides,
  });

  const routes = createWebChatRoutes({
    resolveConnection: async (connectionId, channel) =>
      channel === "web" && /^conn-[a-z0-9-]+$/u.test(connectionId) ? workspaceFor(connectionId) : null,
    allowedOrigins: () => [ALLOWED_ORIGIN],
    sessionSecret: SESSION_SECRET,
    responder: host.responder,
    requestHandoff: host.requestHandoff,
    describeCitation: async (workspace, citation) => {
      const source = repository.getSource(workspace, citation.sourceId);
      const version = repository.getVersion(workspace, citation.sourceId, citation.sourceVersionId);
      return source && version?.status === "approved" ? { title: source.title } : null;
    },
    clientKey: () => "integration-test-client",
    limits: {
      client: { limit: 1_000, windowMs: 60_000 },
      session: { limit: 1_000, windowMs: 60_000 },
    },
    secureCookie: false,
    now: Date.now,
  });

  const openSession = (connectionId: string) => {
    const session = issueWebChatSession({ connectionId });
    const token = signSessionToken(session, SESSION_SECRET);
    return Object.freeze({ cookie: `${WEB_CHAT_COOKIE_NAME}=${token}`, conversationId: session.conversationId });
  };

  const post = (connectionId: string, cookie: string, body: Record<string, string>) =>
    routes.message(new Request("https://shop.example.com/chat/message", {
      method: "POST",
      headers: {
        cookie,
        origin: ALLOWED_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ connectionId, ...body }),
    }));

  return Object.freeze({
    repository,
    conversations: baseConversations,
    routes,
    createCalls: () => createCalls,
    createdConversations: () => createdConversations,
    handoffReasons,
    host,
    openSession,
    send: (connectionId: string, cookie: string, text: string) => post(connectionId, cookie, { text }),
    sendHandoff: (connectionId: string, cookie: string) => post(connectionId, cookie, { action: "handoff" }),
    load: (connectionId: string, conversationId: string) =>
      baseConversations.load(workspaceFor(connectionId), conversationId),
  });
}

type AnswerResponse = Readonly<{
  kind: "answer";
  text: string;
  citations: readonly Readonly<{ title: string; sourceVersionId: string; position: string; locator: { kind: string } }>[];
}>;

type UncertainResponse = Readonly<{ kind: "uncertain"; text: string }>;

test("end-to-end: a customer document is answered with a citation that resolves in the repository", async () => {
  const harness = createHarness();
  const session = harness.openSession("conn-answer");
  const response = await harness.send("conn-answer", session.cookie, "คืนสินค้าได้ภายในกี่วัน");

  assert.equal(response.status, 200);
  const body = await response.json() as AnswerResponse;
  assert.equal(body.kind, "answer");
  assert.match(body.text, /เปลี่ยนคืนสินค้าได้ภายใน 7 วัน/);
  assert.ok(body.citations.length >= 1, "answer must expose at least one citation chip");

  const returnChip = body.citations.find((chip) => chip.title === "นโยบายการคืนสินค้า");
  assert.ok(returnChip, "the return-policy citation must resolve to its source title");
  assert.equal(returnChip.sourceVersionId, "v1");
  assert.equal(returnChip.locator.kind, "span");

  const workspace = workspaceFor("conn-answer");
  const version = harness.repository.getVersion(workspace, "faq-return", "v1");
  assert.ok(version);
  const chunk = version.chunks.find((candidate) =>
    JSON.stringify(candidate.locator) === JSON.stringify(returnChip.locator));
  assert.ok(chunk, "citation locator must point at a chunk in the approved version");
  assert.equal(harness.repository.isCurrentCitation(workspace, {
    workspaceId: SHOP,
    sourceId: "faq-return",
    sourceVersionId: "v1",
    chunkId: chunk.chunkId,
    locator: chunk.locator,
  }, "customer"), true);
});

test("end-to-end: an internal document never reaches the customer answer even for an exact question", async () => {
  const harness = createHarness();
  const workspace = workspaceFor("conn-internal");
  const retriever = new KnowledgeRetriever(harness.repository);

  const customer = await retriever.search({
    workspace,
    query: "ต้นทุน CERAMIC-77 เท่าไหร่",
    limit: 5,
    audience: "customer",
  });
  assert.equal(customer.kind, "evidence");
  if (customer.kind === "evidence") {
    assert.equal(customer.hits.some((hit) => hit.sourceId === "internal-cost"), false);
  }
  const staff = await retriever.search({
    workspace,
    query: "ต้นทุน CERAMIC-77 เท่าไหร่",
    limit: 5,
    audience: "staff",
  });
  assert.equal(staff.kind, "evidence");
  if (staff.kind === "evidence") {
    assert.equal(staff.hits.some((hit) => hit.sourceId === "internal-cost"), true);
  }

  const session = harness.openSession("conn-internal");
  const response = await harness.send("conn-internal", session.cookie, "ต้นทุน CERAMIC-77 เท่าไหร่");
  assert.equal(response.status, 200);
  const raw = await response.text();
  assert.doesNotMatch(raw, /ราคาทุน|กำไรขั้นต้น|450|ต้นทุนและกำไร/u);
  const body = JSON.parse(raw) as UncertainResponse;
  assert.equal(body.kind, "uncertain");
  assert.deepEqual(harness.handoffReasons, ["INSUFFICIENT_EVIDENCE"]);
});

test("end-to-end: an off-topic question requests handoff and the route answers 200 uncertain, not an answer", async () => {
  const harness = createHarness();
  const session = harness.openSession("conn-offtopic");
  const response = await harness.send("conn-offtopic", session.cookie, "ต้นทุนสินค้าและกำไรขั้นต้นเท่าไหร่");

  assert.equal(response.status, 200);
  const body = await response.json() as UncertainResponse;
  assert.equal(body.kind, "uncertain");
  assert.doesNotMatch(body.text, /ราคาทุน|กำไรขั้นต้น|450/u);
  assert.deepEqual(harness.handoffReasons, ["INSUFFICIENT_EVIDENCE"]);
});

test("end-to-end: the first message creates the conversation once and later messages reuse it", async () => {
  const harness = createHarness();
  const workspace = workspaceFor("conn-create");
  const session = harness.openSession("conn-create");

  assert.equal(await harness.conversations.load(workspace, session.conversationId), null);
  assert.equal(harness.createCalls(), 0);

  const first = await harness.send("conn-create", session.cookie, "ร้านเปิดกี่โมง");
  assert.equal(first.status, 200);
  assert.equal(harness.createCalls(), 1);
  const created = await harness.conversations.load(workspace, session.conversationId);
  assert.ok(created);
  assert.equal(created.status, "ai_active");
  assert.equal(created.version, 0);

  const second = await harness.send("conn-create", session.cookie, "จัดส่งใช้เวลากี่วัน");
  assert.equal(second.status, 200);
  assert.equal(harness.createCalls(), 1, "the second message must not recreate the conversation");
});

test("end-to-end: a customer handoff before any chat creates the conversation with customer_requested", async () => {
  const harness = createHarness();
  const workspace = workspaceFor("conn-handoff-first");
  const session = harness.openSession("conn-handoff-first");

  assert.equal(await harness.conversations.load(workspace, session.conversationId), null);
  const response = await harness.sendHandoff("conn-handoff-first", session.cookie);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { kind: "handoff_recorded" });

  const created = await harness.conversations.load(workspace, session.conversationId);
  assert.ok(created);
  assert.equal(created.status, "handoff_requested");
  assert.equal(created.handoffReason, "customer_requested");
  assert.equal(harness.createCalls(), 1);
  assert.deepEqual(harness.handoffReasons, [], "the customer button uses the conversation contract, not the answer-path handoff port");
});

test("end-to-end: two visitors in the same workspace never share conversation state", async () => {
  const harness = createHarness();
  const visitorA = harness.openSession("conn-visitor-a");
  const visitorB = harness.openSession("conn-visitor-b");
  assert.notEqual(visitorA.conversationId, visitorB.conversationId);

  const answerA = await harness.send("conn-visitor-a", visitorA.cookie, "คืนสินค้าได้ภายในกี่วัน");
  assert.equal(answerA.status, 200);
  assert.equal((await answerA.json() as AnswerResponse).kind, "answer");

  // A pauses their own conversation through the customer handoff button.
  const handoffA = await harness.sendHandoff("conn-visitor-a", visitorA.cookie);
  assert.equal(handoffA.status, 200);

  // A is now paused...
  const pausedA = await harness.send("conn-visitor-a", visitorA.cookie, "คืนสินค้าได้ภายในกี่วัน");
  assert.equal(pausedA.status, 200);
  assert.equal((await pausedA.json() as UncertainResponse).kind, "uncertain");

  // ...but B is unaffected and gets a real answer.
  const answerB = await harness.send("conn-visitor-b", visitorB.cookie, "คืนสินค้าได้ภายในกี่วัน");
  assert.equal(answerB.status, 200);
  assert.equal((await answerB.json() as AnswerResponse).kind, "answer");

  const conversationA = await harness.load("conn-visitor-a", visitorA.conversationId);
  const conversationB = await harness.load("conn-visitor-b", visitorB.conversationId);
  assert.equal(conversationA?.status, "handoff_requested");
  assert.equal(conversationB?.status, "ai_active");
});

test("the default answer port keeps the model off and never touches createModelPort", async (t) => {
  for (const mode of ["omitted", "disabled"] as const) {
    await t.test(`model ${mode}`, async () => {
      let modelPortCalls = 0;
      const createModelPort = () => {
        modelPortCalls += 1;
        throw new Error("model port must not be built");
      };
      const harness = createHarness({
        hostOverrides: {
          answer: undefined,
          model: mode === "omitted" ? { createModelPort } : { enabled: false, createModelPort },
        },
      });
      const session = harness.openSession("conn-model-off");
      const response = await harness.send("conn-model-off", session.cookie, "ร้านเปิดกี่โมง");
      assert.equal(response.status, 200);
      assert.equal((await response.json() as AnswerResponse).kind, "answer");
      assert.equal(modelPortCalls, 0);
    });
  }
});

test("a caller cannot downgrade or spoof the audience: the host always answers as customer", async () => {
  const harness = createHarness();
  const workspace = workspaceFor("conn-audience");
  const captured: KnowledgeRetrievalQuery[] = [];
  const retriever = new KnowledgeRetriever(harness.repository);

  const host = createWebChatHost({
    conversations: harness.conversations,
    retrieval: {
      async search(query): Promise<KnowledgeRetrievalResult> {
        captured.push(query);
        return retriever.search(query);
      },
    },
    evidenceFreshness: {
      areCurrentAndApproved: (ws, citations, audience) =>
        areKnowledgeCitationsCurrent(harness.repository, ws, citations, audience),
    },
    answerability: createExtractiveAnswerabilityPort(),
    handoff: { async request() {} },
    now: () => FIXED_NOW,
  });

  const result = await host.responder({
    workspace,
    conversationId: "conversation-audience",
    query: "ร้านเปิดกี่โมง",
    audience: "staff" as never,
  });
  assert.equal(result.kind, "answer");
  assert.equal(captured.length, 1);
  assert.equal(captured[0]!.audience, "customer");
});

/**
 * FIX1 (H1) fixture: three retrieved documents in an order where the first two
 * share vocabulary with the question but do not answer it.
 */
const GROUNDING_DOCUMENTS: readonly SyntheticDocument[] = Object.freeze([
  { sourceId: "faq-vip-refund", title: "นโยบายคืนเงิน VIP", text: "ลูกค้า VIP คืนเงินได้ภายใน 30 วัน" },
  { sourceId: "faq-closed", title: "วันหยุดร้าน", text: "ร้านปิดวันอาทิตย์" },
  { sourceId: "faq-shipping-fee", title: "ค่าจัดส่ง", text: "ค่าจัดส่งเริ่มต้น 50 บาท" },
]);

function retrievalHits(
  repository: InMemoryKnowledgeRepository,
  workspace: TrustedWorkspaceContext,
  sourceIds: readonly string[],
): readonly KnowledgeRetrievalHit[] {
  return Object.freeze(sourceIds.map((sourceId, index) => {
    const source = repository.getSource(workspace, sourceId);
    const version = repository.getVersion(workspace, sourceId, "v1");
    assert.ok(source, `missing source ${sourceId}`);
    assert.ok(version, `missing version ${sourceId}`);
    const chunk = version.chunks[0]!;
    return Object.freeze({
      sourceId,
      versionId: "v1",
      title: source.title,
      text: chunk.text,
      score: 1 - index * 0.01,
      citation: Object.freeze({
        workspaceId: workspace.workspaceId,
        sourceId,
        sourceVersionId: "v1",
        chunkId: chunk.chunkId,
        locator: chunk.locator,
      }),
    });
  }));
}

test("end-to-end: the answer quotes only the evidence that supports the question", async () => {
  const workspace = workspaceFor("conn-grounding");
  let harness: Harness | null = null;
  harness = createHarness({
    extraDocuments: GROUNDING_DOCUMENTS,
    // Deliberately unhelpful order: the supporting document is retrieved last.
    retrieval: {
      async search(): Promise<KnowledgeRetrievalResult> {
        return {
          kind: "evidence",
          hits: retrievalHits(harness!.repository, workspace, ["faq-vip-refund", "faq-closed", "faq-shipping-fee"]),
        };
      },
    },
  });
  const session = harness.openSession("conn-grounding");
  const response = await harness.send("conn-grounding", session.cookie, "ค่าจัดส่งเท่าไหร่");

  assert.equal(response.status, 200);
  const body = await response.json() as AnswerResponse;
  assert.equal(body.kind, "answer");
  // Only the shipping-fee sentence; the two earlier hits must never be quoted.
  assert.equal(body.text, "ค่าจัดส่งเริ่มต้น 50 บาท");
  assert.doesNotMatch(body.text, /VIP|ปิดวันอาทิตย์/u);
  assert.equal(body.citations.length, 1);
  assert.equal(body.citations[0]!.title, "ค่าจัดส่ง");
});

test("end-to-end: a question that only shares one topic word with a document is refused", async () => {
  const harness = createHarness({ extraDocuments: GROUNDING_DOCUMENTS });
  const session = harness.openSession("conn-moon");
  const response = await harness.send("conn-moon", session.cookie, "ค่าจัดส่งไปดวงจันทร์เท่าไหร่");

  assert.equal(response.status, 200);
  const body = await response.json() as UncertainResponse;
  assert.equal(body.kind, "uncertain");
  assert.doesNotMatch(body.text, /50 บาท|VIP|ปิดวันอาทิตย์/u);
  assert.deepEqual(harness.handoffReasons, ["INSUFFICIENT_EVIDENCE"]);
});

test("end-to-end: two first messages on one conversation create it once and both answer", async () => {
  // The delay makes both first messages observe "no conversation yet".
  const harness = createHarness({ createDelayMs: 10 });
  const workspace = workspaceFor("conn-race");
  const session = harness.openSession("conn-race");
  assert.equal(await harness.conversations.load(workspace, session.conversationId), null);

  const [first, second] = await Promise.all([
    harness.send("conn-race", session.cookie, "ร้านเปิดกี่โมง"),
    harness.send("conn-race", session.cookie, "คืนสินค้าได้ภายในกี่วัน"),
  ]);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await first.json() as AnswerResponse).kind, "answer");
  assert.equal((await second.json() as AnswerResponse).kind, "answer");
  assert.equal(harness.createCalls(), 2, "both messages race to create the conversation");
  assert.equal(harness.createdConversations(), 1, "only one conversation row is created");

  const conversation = await harness.load("conn-race", session.conversationId);
  assert.ok(conversation);
  assert.equal(conversation.status, "ai_active");
  assert.equal(conversation.version, 0);
});
