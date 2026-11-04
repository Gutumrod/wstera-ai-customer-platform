import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { createHostHarness, type HostHarness, APP_ORIGIN, OWNER_A } from "./testing/merchant-host-harness.js";
import { createKnowledgeRoutes } from "../apps/merchant-console/lib/knowledge-routes.js";
import { createWebChatRoutes } from "./web-chat-routes.js";
import { renderChatPage } from "../apps/web-chat/render-chat-page.js";
import { retrieveKnowledge } from "../modules/knowledge/index.js";
import { issueWebChatSession, signSessionToken, WEB_CHAT_COOKIE_NAME } from "./web-chat-session.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import type { SupportReply } from "../modules/ai-engine/support-orchestrator.js";

let harness: HostHarness;
let routes: ReturnType<typeof createKnowledgeRoutes>;
let keySequence = 0;

const emptyCounts = {
  knowledge_sources: 0,
  knowledge_versions: 0,
  knowledge_chunks: 0,
  knowledge_quarantine_records: 0,
  knowledge_original_objects: 0,
  objects: 0,
};

before(async () => {
  harness = await createHostHarness();
});

after(async () => {
  await harness.close();
});

beforeEach(async () => {
  routes = createKnowledgeRoutes(harness.requireHost);
  harness.session.userId = OWNER_A;
  harness.session.afterIdentity = undefined;
  harness.objects.clear();
  await harness.database.exec(`
    DELETE FROM aicp.knowledge_original_objects;
    DELETE FROM aicp.knowledge_chunks;
    DELETE FROM aicp.knowledge_versions;
    DELETE FROM aicp.knowledge_sources;
    DELETE FROM aicp.knowledge_quarantine_records;
    UPDATE aicp.workspace_memberships SET status = 'active';
    UPDATE aicp.workspaces SET status = 'active';
  `);
});

const url = (path: string) => `${APP_ORIGIN}/api/knowledge/${path}`;
const originHeaders = { origin: APP_ORIGIN };

function uploadRequest(fields: Record<string, string | File>, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  keySequence += 1;
  return new Request(url("sources"), {
    method: "POST",
    headers: {
      ...originHeaders,
      "idempotency-key": `synthetic-intake-${String(keySequence).padStart(6, "0")}`,
      ...headers,
    },
    body: form,
  });
}

const params = (sourceId: string, versionId: string) => ({
  params: Promise.resolve({ sourceId, versionId }),
});

const getVersionRow = async (versionId: string) =>
  (await harness.database.query<{ status: string; visibility: string }>(
    "SELECT status, visibility FROM aicp.knowledge_versions WHERE version_id = $1",
    [versionId],
  )).rows[0];

// ============================================================================
// INTAKE VISIBILITY TESTS
// ============================================================================

test("intake accepts visibility=customer for FAQ and stores visibility=customer", async () => {
  const res = await routes.createSource(uploadRequest({
    kind: "faq",
    title: "FAQ Customer Policy",
    content: "นโยบายการจัดส่งสินค้าถึงมือลูกค้าภายใน 3 วันทำการ",
    visibility: "customer",
  } as never));

  assert.equal(res.status, 201);
  const json = (await res.json()) as { data: { sourceId: string; versionId: string } };
  const row = await getVersionRow(json.data.versionId);
  assert.ok(row, "Version row must exist");
  assert.equal(row.visibility, "customer");
});

test("intake accepts visibility=customer for CSV file and stores visibility=customer", async () => {
  const csvFile = new File(
    ["sku,name,price\nSKU-100,Widget,500"],
    "products.csv",
    { type: "text/csv" },
  );

  const res = await routes.createSource(uploadRequest({
    kind: "csv",
    title: "Public Product Catalog",
    file: csvFile,
    visibility: "customer",
  } as never));

  assert.equal(res.status, 201);
  const json = (await res.json()) as { data: { sourceId: string; versionId: string } };
  const row = await getVersionRow(json.data.versionId);
  assert.ok(row, "Version row must exist");
  assert.equal(row.visibility, "customer");
});

test("intake defaults visibility to internal when field is omitted", async () => {
  // FAQ without visibility
  const faqRes = await routes.createSource(uploadRequest({
    kind: "faq",
    title: "Internal Runbook",
    content: "ขั้นตอนการตรวจสอบสต็อกภายในร้านค้าสำหรับพนักงาน",
  }));
  assert.equal(faqRes.status, 201);
  const faqJson = (await faqRes.json()) as { data: { sourceId: string; versionId: string } };
  const faqRow = await getVersionRow(faqJson.data.versionId);
  assert.ok(faqRow);
  assert.equal(faqRow.visibility, "internal");

  // CSV without visibility
  const csvFile = new File(
    ["sku,cost\nSKU-100,200"],
    "internal_costs.csv",
    { type: "text/csv" },
  );
  const csvRes = await routes.createSource(uploadRequest({
    kind: "csv",
    title: "Internal Costs",
    file: csvFile,
  }));
  assert.equal(csvRes.status, 201);
  const csvJson = (await csvRes.json()) as { data: { sourceId: string; versionId: string } };
  const csvRow = await getVersionRow(csvJson.data.versionId);
  assert.ok(csvRow);
  assert.equal(csvRow.visibility, "internal");
});

test("intake rejects invalid visibility with 400 INVALID_KNOWLEDGE_INPUT and writes nothing", async () => {
  // Invalid string: "admin"
  const resAdmin = await routes.createSource(uploadRequest({
    kind: "faq",
    title: "Returns",
    content: "คืนสินค้าได้ภายใน 7 วัน",
    visibility: "admin",
  } as never));
  assert.equal(resAdmin.status, 400);
  assert.deepEqual(await resAdmin.json(), { error: "INVALID_KNOWLEDGE_INPUT" });
  assert.deepEqual(await harness.rowCounts(), emptyCounts);

  // Empty string: ""
  const resEmpty = await routes.createSource(uploadRequest({
    kind: "faq",
    title: "Returns",
    content: "คืนสินค้าได้ภายใน 7 วัน",
    visibility: "",
  } as never));
  assert.equal(resEmpty.status, 400);
  assert.deepEqual(await resEmpty.json(), { error: "INVALID_KNOWLEDGE_INPUT" });
  assert.deepEqual(await harness.rowCounts(), emptyCounts);

  // Invalid string: "secret"
  const resSecret = await routes.createSource(uploadRequest({
    kind: "faq",
    title: "Returns",
    content: "คืนสินค้าได้ภายใน 7 วัน",
    visibility: "secret",
  } as never));
  assert.equal(resSecret.status, 400);
  assert.deepEqual(await resSecret.json(), { error: "INVALID_KNOWLEDGE_INPUT" });
  assert.deepEqual(await harness.rowCounts(), emptyCounts);
});

test("intake rejects unauthenticated request even with visibility and writes nothing", async () => {
  harness.session.userId = null;
  const res = await routes.createSource(uploadRequest({
    kind: "faq",
    title: "Returns",
    content: "คืนสินค้าได้ภายใน 7 วัน",
    visibility: "customer",
  } as never));

  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "UNAUTHENTICATED" });
  assert.deepEqual(await harness.rowCounts(), emptyCounts);
});

test("retrieval with audience customer sees customer docs and not internal docs", async () => {
  const { repository, identity } = await harness.requireHost();

  // Upload doc 1: customer visibility
  const doc1Res = await routes.createSource(uploadRequest({
    kind: "faq",
    title: "Customer Return FAQ",
    content: "ลูกค้าสามารถคืนสินค้าได้ภายใน 14 วันผ่านพอร์ทัลลูกค้า",
    visibility: "customer",
  } as never));
  assert.equal(doc1Res.status, 201);
  const doc1 = ((await doc1Res.json()) as { data: { sourceId: string; versionId: string } }).data;

  // Upload doc 2: internal visibility
  const doc2Res = await routes.createSource(uploadRequest({
    kind: "faq",
    title: "Internal Staff Return Guide",
    content: "แนวทางภายในสำหรับเจ้าหน้าที่รับคืนสินค้าและตรวจสต็อก",
    visibility: "internal",
  } as never));
  assert.equal(doc2Res.status, 201);
  const doc2 = ((await doc2Res.json()) as { data: { sourceId: string; versionId: string } }).data;

  // Approve both versions
  const approveReq = () => new Request(url("sources/x/versions/y/approve"), { method: "POST", headers: originHeaders });
  const app1 = await routes.approveVersion(approveReq(), params(doc1.sourceId, doc1.versionId));
  assert.equal(app1.status, 200);
  const app2 = await routes.approveVersion(approveReq(), params(doc2.sourceId, doc2.versionId));
  assert.equal(app2.status, 200);

  // Retrieve as customer
  const customerResult = await retrieveKnowledge(repository, {
    workspace: identity.workspace,
    query: "คืนสินค้า",
    limit: 5,
    audience: "customer",
  });
  assert.equal(customerResult.kind, "evidence");
  const customerSourceIds = customerResult.hits.map((h) => h.citation.sourceId);
  assert.ok(customerSourceIds.includes(doc1.sourceId), "Customer must see customer doc");
  assert.equal(customerSourceIds.includes(doc2.sourceId), false, "Customer must NOT see internal doc");

  // Retrieve as staff
  const staffResult = await retrieveKnowledge(repository, {
    workspace: identity.workspace,
    query: "คืนสินค้า",
    limit: 5,
    audience: "staff",
  });
  assert.equal(staffResult.kind, "evidence");
  const staffSourceIds = staffResult.hits.map((h) => h.citation.sourceId);
  assert.ok(staffSourceIds.includes(doc1.sourceId), "Staff must see customer doc");
  assert.ok(staffSourceIds.includes(doc2.sourceId), "Staff must see internal doc");
});

// ============================================================================
// N1: MESSAGE ENDPOINT CONTRACT & INTEGRATION TESTS
// ============================================================================

const TEST_SECRET = "super-secret-key-at-least-32-bytes-long-for-hmac";
const TRUSTED_WORKSPACE: TrustedWorkspaceContext = Object.freeze({
  workspaceId: "shop-a",
  connectionId: "web-a",
  channel: "web",
});
const ALLOWED_ORIGIN = "https://shop.example.com";

function createWebChatHarness(overrides: Record<string, unknown> = {}) {
  const defaultResponder = async ({ query }: {
    workspace: TrustedWorkspaceContext;
    conversationId: string;
    query: string;
    audience: "customer";
  }): Promise<SupportReply> => {
    return Object.freeze({
      kind: "answer",
      text: `ตอบสำหรับ: ${query}`,
      citations: [],
      conversationVersion: 1,
    });
  };

  const deps = {
    messageEndpoint: "/chat/message",
    resolveConnection: async (connectionId: string, channel: "web") => {
      if (connectionId === TRUSTED_WORKSPACE.connectionId && channel === "web") {
        return TRUSTED_WORKSPACE;
      }
      return null;
    },
    allowedOrigins: async (conn: TrustedWorkspaceContext) => {
      if (conn.workspaceId === TRUSTED_WORKSPACE.workspaceId) {
        return [ALLOWED_ORIGIN];
      }
      return [];
    },
    sessionSecret: TEST_SECRET,
    responder: defaultResponder,
    requestHandoff: async () => {},
    clientKey: () => "test-client-ip",
    limits: {
      client: { limit: 10, windowMs: 60_000 },
      session: { limit: 5, windowMs: 60_000 },
    },
    secureCookie: false,
    now: Date.now,
    ...overrides,
  };

  const routes = (createWebChatRoutes as (d: unknown) => ReturnType<typeof createWebChatRoutes>)(deps);
  return { routes, deps };
}

test("createWebChatRoutes throws when messageEndpoint is not an absolute path starting with /", () => {
  const invalidEndpoints = [
    "./message",
    "message",
    "",
    "   ",
    "http://external.example/message",
    undefined,
    null,
    123,
  ];

  for (const ep of invalidEndpoints) {
    assert.throws(
      () => createWebChatHarness({ messageEndpoint: ep }),
      (err: unknown) => {
        return err instanceof Error && /messageEndpoint/.test(err.message);
      },
      `Expected createWebChatRoutes to throw for messageEndpoint=${JSON.stringify(ep)}`,
    );
  }
});

test("webchat page renders exact absolute messageEndpoint and integration message fetch succeeds", async () => {
  const testEndpoint = "/chat/message";
  const { routes } = createWebChatHarness({ messageEndpoint: testEndpoint });

  // 1. Request chat page
  const pageReq = new Request(`https://example.com/chat?c=${TRUSTED_WORKSPACE.connectionId}`, {
    method: "GET",
  });
  const pageRes = await routes.page(pageReq);
  assert.equal(pageRes.status, 200);

  const html = await pageRes.text();

  // Extract session cookie from Set-Cookie header
  const setCookie = pageRes.headers.get("set-cookie");
  assert.ok(setCookie, "Page must issue session cookie");
  const cookieMatch = setCookie.match(/([^;]+)/);
  const cookieHeader = cookieMatch ? cookieMatch[1]! : "";

  // 2. Verify HTML renders the exact messageEndpoint passed in and NOT the old relative fallback
  assert.equal(html.includes('"./message"'), false, "HTML must not contain old relative fallback './message'");
  assert.ok(
    html.includes(`const messageEndpoint = ${JSON.stringify(testEndpoint)};`),
    `HTML must contain exact literal assignment for ${testEndpoint}`,
  );

  // 3. Extract the endpoint as the client script does
  const endpointMatch = html.match(/const\s+messageEndpoint\s*=\s*(".*?"|'.*?');/);
  assert.ok(endpointMatch, "Client script must declare messageEndpoint");
  const extractedEndpoint = JSON.parse(endpointMatch[1]!) as string;
  assert.equal(extractedEndpoint, testEndpoint);

  // 4. Integration: POST to the extracted endpoint via message route
  const msgReq = new Request(`https://example.com${extractedEndpoint}`, {
    method: "POST",
    headers: {
      origin: ALLOWED_ORIGIN,
      cookie: cookieHeader,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      connectionId: TRUSTED_WORKSPACE.connectionId,
      text: "สอบถามเวลาเปิดปิดร้าน",
    }),
  });

  const msgRes = await routes.message(msgReq);
  assert.equal(msgRes.status, 200);
  const msgJson = (await msgRes.json()) as { kind: string; text: string };
  assert.equal(msgJson.kind, "answer");
  assert.equal(msgJson.text, "ตอบสำหรับ: สอบถามเวลาเปิดปิดร้าน");
});

test("renderChatPage requires messageEndpoint and injects it verbatim", () => {
  const customEndpoint = "/api/v1/customer/chat/message";
  const html = (renderChatPage as (p: unknown) => string)({
    connectionId: "conn-contract-test",
    nonce: "test-nonce",
    messageEndpoint: customEndpoint,
  });

  assert.equal(html.includes('"./message"'), false);
  assert.ok(html.includes(`const messageEndpoint = ${JSON.stringify(customEndpoint)};`));
});
