import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { KnowledgeError } from "../contracts/data/knowledge.js";
import { createKnowledgeRoutes } from "../apps/merchant-console/lib/knowledge-routes.js";
import { HttpError, routeErrorResponse } from "../apps/merchant-console/lib/http.js";
import { createRateLimiter } from "../apps/merchant-console/lib/rate-limit.js";
import { APP_ORIGIN, OWNER_A, OWNER_B, STAFF_A, createHostHarness, type HostHarness } from "./testing/merchant-host-harness.js";

let harness: HostHarness;
let routes: ReturnType<typeof createKnowledgeRoutes>;
const emptyCounts = { knowledge_sources: 0, knowledge_versions: 0, knowledge_chunks: 0, knowledge_quarantine_records: 0, knowledge_original_objects: 0, objects: 0 };
let keySequence = 0;

before(async () => { harness = await createHostHarness(); });
after(async () => { await harness.close(); });
beforeEach(async () => {
  routes = createKnowledgeRoutes(harness.requireHost);
  harness.session.userId = OWNER_A;
  harness.session.afterIdentity = undefined;
  harness.objects.clear();
  await harness.database.exec(`
    DELETE FROM aicp.knowledge_original_objects; DELETE FROM aicp.knowledge_chunks; DELETE FROM aicp.knowledge_versions;
    DELETE FROM aicp.knowledge_sources; DELETE FROM aicp.knowledge_quarantine_records;
    UPDATE aicp.workspace_memberships SET status = 'active'; UPDATE aicp.workspaces SET status = 'active';
  `);
});

const url = (path: string) => `${APP_ORIGIN}/api/knowledge/${path}`;
const originHeaders = { origin: APP_ORIGIN };

function searchRequest(body: string, headers: Record<string, string> = {}) {
  return new Request(url("search"), { method: "POST", headers: { ...originHeaders, "content-type": "application/json", ...headers }, body });
}

function uploadRequest(fields: Record<string, string | File>, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, value);
  keySequence += 1;
  return new Request(url("sources"), {
    method: "POST",
    headers: { ...originHeaders, "idempotency-key": `synthetic-key-${String(keySequence).padStart(6, "0")}`, ...headers },
    body: form,
  });
}

const faqFields = { kind: "faq", title: "Returns", content: "คืนสินค้าได้ภายใน 7 วันนับจากวันที่ได้รับสินค้า" };
const approveRequest = () => new Request(url("sources/x/versions/y/approve"), { method: "POST", headers: originHeaders });
const params = (sourceId: string, versionId: string) => ({ params: Promise.resolve({ sourceId, versionId }) });

async function expectError(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: code });
  assert.equal(response.headers.get("cache-control"), "no-store");
}

async function uploadFaq() {
  const response = await routes.createSource(uploadRequest(faqFields));
  assert.equal(response.status, 201);
  return (await response.json() as { data: { sourceId: string; versionId: string; status: string } }).data;
}

const versionRow = async (versionId: string) => (await harness.database.query<{ status: string; approved_by: string | null }>(
  "SELECT status, approved_by FROM aicp.knowledge_versions WHERE version_id = $1", [versionId])).rows[0];

test("every route answers 401 without a session and writes nothing", async () => {
  harness.session.userId = null;
  await expectError(await routes.listSources(new Request(url("sources"), { headers: originHeaders })), 401, "UNAUTHENTICATED");
  await expectError(await routes.createSource(uploadRequest(faqFields)), 401, "UNAUTHENTICATED");
  await expectError(await routes.approveVersion(approveRequest(), params("x", "y")), 401, "UNAUTHENTICATED");
  await expectError(await routes.search(searchRequest(JSON.stringify({ query: "x" }))), 401, "UNAUTHENTICATED");
  assert.deepEqual(await harness.rowCounts(), emptyCounts);
});

test("state-changing routes refuse a missing or foreign origin", async () => {
  const foreign = { origin: "http://evil.example" };
  await expectError(await routes.createSource(uploadRequest(faqFields, foreign)), 403, "ORIGIN_DENIED");
  await expectError(await routes.search(searchRequest(JSON.stringify({ query: "x" }), foreign)), 403, "ORIGIN_DENIED");
  await expectError(await routes.approveVersion(new Request(url("a"), { method: "POST" }), params("x", "y")), 403, "ORIGIN_REQUIRED");
  assert.deepEqual(await harness.rowCounts(), emptyCounts);
});

test("GET accepts the console's own same-origin fetch and refuses cross-site reads", async () => {
  // Browsers omit Origin on a same-origin GET, so Sec-Fetch-Site is the signal that must decide.
  const sameOrigin = await routes.listSources(new Request(url("sources"), { headers: { "sec-fetch-site": "same-origin" } }));
  assert.equal(sameOrigin.status, 200);
  await expectError(await routes.listSources(new Request(url("sources"), { headers: { "sec-fetch-site": "cross-site" } })), 403, "ORIGIN_DENIED");
  await expectError(await routes.listSources(new Request(url("sources"), { headers: { "sec-fetch-site": "same-site" } })), 403, "ORIGIN_DENIED");
  await expectError(await routes.listSources(new Request(url("sources"), { headers: { origin: "http://evil.example" } })), 403, "ORIGIN_DENIED");
  await expectError(await routes.listSources(new Request(url("sources"))), 403, "ORIGIN_REQUIRED");
  assert.equal((await routes.listSources(new Request(url("sources"), { headers: originHeaders }))).status, 200);
});

test("upload rejects oversized, wrong content type and unknown fields before writing", async () => {
  await expectError(await routes.createSource(new Request(url("sources"), {
    method: "POST",
    headers: { ...originHeaders, "content-type": "multipart/form-data; boundary=x", "content-length": String(6 * 1024 * 1024) },
    body: "x",
  })), 413, "REQUEST_TOO_LARGE");
  await expectError(await routes.createSource(new Request(url("sources"), {
    method: "POST", headers: { ...originHeaders, "content-type": "application/json" }, body: "{}",
  })), 415, "MULTIPART_FORM_DATA_REQUIRED");
  await expectError(await routes.createSource(uploadRequest({ ...faqFields, workspaceId: "shop-b" })), 400, "INVALID_FORM_FIELDS");
  await expectError(await routes.createSource(uploadRequest({ kind: "exe", title: "x" })), 400, "INVALID_KNOWLEDGE_INPUT");
  await expectError(await routes.createSource(uploadRequest(faqFields, { "idempotency-key": "short" })), 400, "IDEMPOTENCY_KEY_REQUIRED");
  assert.deepEqual(await harness.rowCounts(), emptyCounts);
});

test("search rejects oversized, malformed, wrong content type and unknown fields", async () => {
  await expectError(await routes.search(searchRequest(JSON.stringify({ query: "x".repeat(5_000) }))), 413, "REQUEST_TOO_LARGE");
  await expectError(await routes.search(searchRequest("{not json")), 400, "JSON_BODY_INVALID");
  await expectError(await routes.search(searchRequest("{}", { "content-type": "text/plain" })), 415, "JSON_CONTENT_TYPE_REQUIRED");
  await expectError(await routes.search(searchRequest(JSON.stringify({ query: "x", workspaceId: "shop-b" }))), 400, "INVALID_RETRIEVAL_QUERY");
  assert.deepEqual(await harness.rowCounts(), emptyCounts);
});

test("a rejected file is quarantined apart from knowledge and stays inside its workspace", async () => {
  const response = await routes.createSource(uploadRequest({
    kind: "csv", title: "Bad", file: new File(['a,b\n"unterminated'], "bad.csv", { type: "text/csv" }),
  }));
  await expectError(response, 422, "MALFORMED_FILE");
  const counts = await harness.rowCounts();
  assert.equal(counts.knowledge_quarantine_records, 1);
  assert.equal(counts.knowledge_sources, 0);
  assert.equal(counts.knowledge_versions, 0);
  assert.ok([...harness.objects.keys()].every((path) => path.startsWith("shop-a/quarantine/")));
  const own = await (await routes.listSources(new Request(url("sources"), { headers: originHeaders }))).json() as { quarantine: unknown[] };
  assert.equal(own.quarantine.length, 1);
  harness.session.userId = OWNER_B;
  const other = await (await routes.listSources(new Request(url("sources"), { headers: originHeaders }))).json() as { quarantine: unknown[]; data: unknown[] };
  assert.deepEqual([other.quarantine, other.data], [[], []]);
});

test("only the signed-in owner of the workspace can approve, and the approver comes from the session", async () => {
  const version = await uploadFaq();
  assert.equal(version.status, "indexed");

  harness.session.userId = STAFF_A;
  await expectError(await routes.approveVersion(approveRequest(), params(version.sourceId, version.versionId)), 403, "OWNER_ROLE_REQUIRED");
  assert.equal((await versionRow(version.versionId))?.status, "indexed");

  harness.session.userId = OWNER_B;
  await expectError(await routes.approveVersion(approveRequest(), params(version.sourceId, version.versionId)), 404, "SOURCE_NOT_FOUND");
  assert.equal((await versionRow(version.versionId))?.status, "indexed");

  harness.session.userId = OWNER_A;
  const approved = await routes.approveVersion(approveRequest(), params(version.sourceId, version.versionId));
  assert.equal(approved.status, 200);
  const body = await approved.json() as { data: { status: string; chunkCount: number } };
  assert.equal(body.data.status, "approved");
  assert.ok(body.data.chunkCount > 0);
  assert.deepEqual(await versionRow(version.versionId), { status: "approved", approved_by: OWNER_A });
  await expectError(await routes.approveVersion(approveRequest(), params(version.sourceId, version.versionId)), 400, "APPROVAL_NOT_ELIGIBLE");
  await expectError(await routes.approveVersion(approveRequest(), params("../x", version.versionId)), 404, "VERSION_NOT_FOUND");
});

test("search returns approved evidence for its own workspace only, whatever the request claims", async () => {
  const version = await uploadFaq();
  const beforeApproval = await routes.search(searchRequest(JSON.stringify({ query: "คืนสินค้า" })));
  assert.deepEqual(await beforeApproval.json(), { data: { kind: "no_answer", reason: "NO_APPROVED_EVIDENCE" } });
  assert.equal((await routes.approveVersion(approveRequest(), params(version.sourceId, version.versionId))).status, 200);

  const own = await (await routes.search(searchRequest(JSON.stringify({ query: "คืนสินค้า" })))).json() as { data: { kind: string; hits: Array<{ citation: { workspaceId: string } }> } };
  assert.equal(own.data.kind, "evidence");
  assert.equal(own.data.hits[0]?.citation.workspaceId, "shop-a");

  harness.session.userId = OWNER_B;
  const other = await routes.search(searchRequest(JSON.stringify({ query: "คืนสินค้า" }), { "x-tenant-id": "shop-a" }));
  assert.deepEqual(await other.json(), { data: { kind: "no_answer", reason: "NO_APPROVED_EVIDENCE" } });
});

test("rate limits answer 429 per identity before reading the request and write nothing", async () => {
  routes = createKnowledgeRoutes(harness.requireHost, {
    upload: { limit: 1, windowMs: 60_000 },
    search: { limit: 1, windowMs: 60_000 },
  });
  await uploadFaq();
  const before = await harness.rowCounts();
  const limited = await routes.createSource(uploadRequest({ ...faqFields, title: "Second" }));
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  assert.deepEqual(await limited.json(), { error: "RATE_LIMITED" });
  assert.deepEqual(await harness.rowCounts(), before);

  harness.session.userId = STAFF_A;
  assert.equal((await routes.createSource(uploadRequest({ ...faqFields, title: "Staff" }))).status, 201, "another identity has its own budget");

  harness.session.userId = OWNER_A;
  assert.equal((await routes.search(searchRequest(JSON.stringify({ query: "x" })))).status, 200);
  await expectError(await routes.search(searchRequest("{not json")), 429, "RATE_LIMITED");
});

test("a membership revoked after identity resolution cannot write", async (t) => {
  const revokeOwner = async () => {
    await harness.database.query("UPDATE aicp.workspace_memberships SET status = 'revoked' WHERE user_id = $1", [OWNER_A]);
  };

  await t.test("FAQ upload", async () => {
    harness.session.afterIdentity = revokeOwner;
    await expectError(await routes.createSource(uploadRequest(faqFields)), 403, "MEMBERSHIP_REQUIRED");
    assert.deepEqual(await harness.rowCounts(), emptyCounts);
  });

  await harness.database.exec("UPDATE aicp.workspace_memberships SET status = 'active'");
  await t.test("quarantine leaves no object behind", async () => {
    harness.session.afterIdentity = revokeOwner;
    await expectError(await routes.createSource(uploadRequest({
      kind: "csv", title: "Bad", file: new File(['a,b\n"unterminated'], "bad.csv", { type: "text/csv" }),
    })), 403, "MEMBERSHIP_REQUIRED");
    assert.deepEqual(await harness.rowCounts(), emptyCounts);
  });

  await harness.database.exec("UPDATE aicp.workspace_memberships SET status = 'active'");
  await t.test("approval", async () => {
    harness.session.afterIdentity = undefined;
    const version = await uploadFaq();
    harness.session.afterIdentity = revokeOwner;
    await expectError(await routes.approveVersion(approveRequest(), params(version.sourceId, version.versionId)), 403, "MEMBERSHIP_REQUIRED");
    assert.equal((await versionRow(version.versionId))?.status, "indexed");
  });

  await harness.database.exec("UPDATE aicp.workspace_memberships SET status = 'active'");
  await t.test("a suspended workspace is refused the same way", async () => {
    harness.session.afterIdentity = async () => {
      await harness.database.exec("UPDATE aicp.workspaces SET status = 'suspended' WHERE workspace_id = 'shop-a'");
    };
    const before = await harness.rowCounts();
    await expectError(await routes.createSource(uploadRequest({ ...faqFields, title: "After suspension" })), 403, "MEMBERSHIP_REQUIRED");
    assert.deepEqual(await harness.rowCounts(), before);
  });
});

test("error status comes from known codes, not from what a message or vendor error happens to contain", async () => {
  await expectError(routeErrorResponse(new KnowledgeError("VERSION_NOT_FOUND")), 404, "VERSION_NOT_FOUND");
  await expectError(routeErrorResponse(new KnowledgeError("SOURCE_CONFLICT")), 409, "SOURCE_CONFLICT");
  await expectError(routeErrorResponse(new KnowledgeError("APPROVED_VERSION_EXISTS")), 409, "APPROVED_VERSION_EXISTS");
  await expectError(routeErrorResponse(new KnowledgeError("CROSS_WORKSPACE_ACCESS_DENIED")), 403, "CROSS_WORKSPACE_ACCESS_DENIED");
  await expectError(routeErrorResponse(new KnowledgeError("MEMBERSHIP_REQUIRED")), 403, "MEMBERSHIP_REQUIRED");
  await expectError(routeErrorResponse(new KnowledgeError("INVALID_KNOWLEDGE_INPUT")), 400, "INVALID_KNOWLEDGE_INPUT");
  await expectError(routeErrorResponse(new HttpError(413, "REQUEST_TOO_LARGE")), 413, "REQUEST_TOO_LARGE");
  await expectError(routeErrorResponse(Object.assign(new Error("vendor"), { status: 418, code: "VENDOR_INTERNAL_CONFLICT" })), 500, "REQUEST_FAILED");
});

test("the rate limiter reopens after its window and keeps its key table bounded", () => {
  let time = 0;
  const limiter = createRateLimiter({ limit: 1, windowMs: 1_000 }, 2, () => time);
  assert.equal(limiter.retryAfterSeconds("a"), 0);
  assert.equal(limiter.retryAfterSeconds("a"), 1);
  time = 1_000;
  assert.equal(limiter.retryAfterSeconds("a"), 0, "a new window opens");
  time = 1_100;
  assert.equal(limiter.retryAfterSeconds("b"), 0);
  assert.equal(limiter.retryAfterSeconds("c"), 0, "the table is full, so the oldest key goes");
  assert.equal(limiter.retryAfterSeconds("a"), 0, "the evicted key starts over instead of the table growing");
  assert.equal(limiter.retryAfterSeconds("c"), 1, "live keys keep their count");
});
