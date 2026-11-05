import assert from "node:assert/strict";
import test from "node:test";
import { createWebChatRoutes, MAX_BODY_BYTES } from "./web-chat-routes.js";
import {
  issueWebChatSession,
  signSessionToken,
  formatSessionSetCookie,
  WEB_CHAT_COOKIE_NAME,
} from "./web-chat-session.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import type { SupportReply } from "../modules/ai-engine/support-orchestrator.js";
import type { KnowledgeCitation } from "../contracts/data/knowledge.js";

const TEST_SECRET = "super-secret-key-at-least-32-bytes-long-for-hmac";
const TRUSTED_WORKSPACE: TrustedWorkspaceContext = Object.freeze({
  workspaceId: "ws-test-1",
  connectionId: "conn-1",
  channel: "web",
});
const ALLOWED_ORIGIN = "https://shop.example.com";

function createHarness(overrides: Partial<Parameters<typeof createWebChatRoutes>[0]> = {}) {
  let handoffCalls: { workspace: TrustedWorkspaceContext; conversationId: string }[] = [];
  let responderCalls: { workspace: TrustedWorkspaceContext; conversationId: string; query: string; audience: "customer" }[] = [];

  const defaultResponder = async ({ workspace, conversationId, query, audience }: {
    workspace: TrustedWorkspaceContext;
    conversationId: string;
    query: string;
    audience: "customer";
  }): Promise<SupportReply> => {
    responderCalls.push({ workspace, conversationId, query, audience });
    return Object.freeze({
      kind: "answer",
      text: `ตอบสำหรับ: ${query}`,
      citations: [
        {
          workspaceId: workspace.workspaceId,
          sourceId: "src-1",
          sourceVersionId: "v-1",
          chunkId: "chk-1",
          locator: { kind: "page" as const, page: 3 },
        },
      ],
      conversationVersion: 1,
    });
  };

  const deps: Parameters<typeof createWebChatRoutes>[0] = {
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
    requestHandoff: async (workspace, conversationId) => {
      handoffCalls.push({ workspace, conversationId });
    },
    describeCitation: async (_ws, cit) => {
      if (cit.sourceId === "src-unnamed") return null;
      return { title: "คู่มือการใช้งาน" };
    },
    clientKey: () => "test-client-ip",
    limits: {
      client: { limit: 10, windowMs: 60_000 },
      session: { limit: 5, windowMs: 60_000 },
    },
    secureCookie: true,
    now: Date.now,
    ...overrides,
  };

  const routes = createWebChatRoutes(deps);
  return { routes, deps, handoffCalls, responderCalls };
}

function makeValidCookie(connectionId = TRUSTED_WORKSPACE.connectionId, secret = TEST_SECRET) {
  const session = issueWebChatSession({ connectionId });
  const token = signSessionToken(session, secret);
  return `${WEB_CHAT_COOKIE_NAME}=${token}`;
}

test("page route returns 404 when connectionId is missing or resolve fails", async () => {
  const { routes } = createHarness();

  // Missing ?c=
  const res1 = await routes.page(new Request("https://example.com/chat"));
  assert.equal(res1.status, 404);
  assert.equal(res1.headers.get("set-cookie"), null);

  // Unresolvable connectionId
  const res2 = await routes.page(new Request("https://example.com/chat?c=non-existent"));
  assert.equal(res2.status, 404);
  assert.equal(res2.headers.get("set-cookie"), null);
});

test("page route sets signed session cookie and strict CSP for resolved connection", async () => {
  const { routes } = createHarness();
  const res = await routes.page(new Request(`https://example.com/chat?c=${TRUSTED_WORKSPACE.connectionId}`));

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");

  const csp = res.headers.get("content-security-policy");
  assert.ok(csp);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'nonce-/);

  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Secure/);
});

test("page route enforces client rate limit with Retry-After (429)", async () => {
  let time = 1_000;
  const { routes } = createHarness({
    now: () => time,
    limits: {
      client: { limit: 2, windowMs: 10_000 },
      session: { limit: 10, windowMs: 10_000 },
    },
  });

  const req = () => new Request(`https://example.com/chat?c=${TRUSTED_WORKSPACE.connectionId}`);
  const res1 = await routes.page(req());
  assert.equal(res1.status, 200);

  const res2 = await routes.page(req());
  assert.equal(res2.status, 200);

  // 3rd page request from same client should be rate limited
  const res3 = await routes.page(req());
  assert.equal(res3.status, 429);
  assert.ok(res3.headers.get("retry-after"));
});

test("message route rejects missing or foreign Origin (403)", async () => {
  const { routes } = createHarness();
  const cookie = makeValidCookie();

  // Missing Origin header
  const res1 = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "hi" }),
  }));
  assert.equal(res1.status, 403);
  assert.deepEqual(await res1.json(), { error: "ORIGIN_REQUIRED" });

  // Foreign Origin header
  const res2 = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: "https://evil.attacker.com",
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "hi" }),
  }));
  assert.equal(res2.status, 403);
  assert.deepEqual(await res2.json(), { error: "ORIGIN_DENIED" });
});

test("message route rejects missing, forged, or expired session cookies (401)", async () => {
  const { routes } = createHarness();
  const headers = {
    origin: ALLOWED_ORIGIN,
    "content-type": "application/json",
  };
  const body = JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "hi" });

  // Missing cookie
  const resMissing = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers,
    body,
  }));
  assert.equal(resMissing.status, 401);
  assert.deepEqual(await resMissing.json(), { error: "UNAUTHENTICATED" });

  // Forged signature
  const forgedCookie = makeValidCookie(TRUSTED_WORKSPACE.connectionId, "wrong-secret-key-of-attacker-at-least-32-bytes");
  const resForged = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: { ...headers, cookie: forgedCookie },
    body,
  }));
  assert.equal(resForged.status, 401);
  assert.deepEqual(await resForged.json(), { error: "UNAUTHENTICATED" });

  // Expired cookie
  let mockTime = 10_000;
  const expiredSession = issueWebChatSession({
    connectionId: TRUSTED_WORKSPACE.connectionId,
    ttlMs: 1_000,
    now: () => mockTime,
  });
  const expiredToken = signSessionToken(expiredSession, TEST_SECRET);
  const expiredCookie = `${WEB_CHAT_COOKIE_NAME}=${expiredToken}`;

  const { routes: expiredRoutes } = createHarness({ now: () => mockTime + 5_000 });
  const resExpired = await expiredRoutes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: { ...headers, cookie: expiredCookie },
    body,
  }));
  assert.equal(resExpired.status, 401);
  assert.deepEqual(await resExpired.json(), { error: "UNAUTHENTICATED" });
});

test("message route returns 404 when connection in cookie cannot be resolved", async () => {
  const { routes } = createHarness();
  const cookie = makeValidCookie("conn-unknown");

  const res = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: "conn-unknown", text: "hi" }),
  }));

  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "NOT_FOUND" });
});

test("message route rejects unsupported Content-Type (415)", async () => {
  const { routes } = createHarness();
  const cookie = makeValidCookie();

  const res = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "text/plain",
    },
    body: "hello",
  }));

  assert.equal(res.status, 415);
  assert.deepEqual(await res.json(), { error: "UNSUPPORTED_MEDIA_TYPE" });
});

test("message route enforces client and session rate limits with Retry-After (429)", async () => {
  let time = 1_000;
  const { routes } = createHarness({
    now: () => time,
    limits: {
      client: { limit: 2, windowMs: 10_000 },
      session: { limit: 10, windowMs: 10_000 },
    },
  });
  const cookie = makeValidCookie();
  const req = () => new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "ping" }),
  });

  const res1 = await routes.message(req());
  assert.equal(res1.status, 200);

  const res2 = await routes.message(req());
  assert.equal(res2.status, 200);

  // Client limit exceeded
  const res3 = await routes.message(req());
  assert.equal(res3.status, 429);
  assert.ok(res3.headers.get("retry-after"));
  assert.deepEqual(await res3.json(), { error: "RATE_LIMITED" });
});

test("message route enforces session rate limit directly and yields 429 before checking oversized body", async () => {
  let time = 1_000;
  let clientCounter = 0;
  const { routes } = createHarness({
    now: () => time,
    clientKey: () => `rotating-client-${clientCounter++}`,
    limits: {
      client: { limit: 100, windowMs: 10_000 },
      session: { limit: 2, windowMs: 10_000 },
    },
  });
  const cookie = makeValidCookie();
  const validReq = () => new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "ping" }),
  });

  const res1 = await routes.message(validReq());
  assert.equal(res1.status, 200);

  const res2 = await routes.message(validReq());
  assert.equal(res2.status, 200);

  // 3rd request has quota exhausted on session and has oversized body (> 16 KiB)
  const hugeText = "x".repeat(30_000);
  const res3 = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: hugeText }),
  }));

  // Must be 429 (session limit hit before reading body), NOT 413 (body size check)
  assert.equal(res3.status, 429);
  assert.ok(res3.headers.get("retry-after"));
  assert.deepEqual(await res3.json(), { error: "RATE_LIMITED" });
});

test("message route rejects oversized body (413) and malformed JSON (400)", async () => {
  const { routes } = createHarness();
  const cookie = makeValidCookie();
  const headers = {
    cookie,
    origin: ALLOWED_ORIGIN,
    "content-type": "application/json",
  };

  // Content-Length header oversized
  const resLen = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: { ...headers, "content-length": String(MAX_BODY_BYTES + 100) },
    body: "{}",
  }));
  assert.equal(resLen.status, 413);

  // Raw body oversized
  const resBody = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers,
    body: " ".repeat(MAX_BODY_BYTES + 1),
  }));
  assert.equal(resBody.status, 413);

  // Malformed JSON
  const resJson = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers,
    body: "{ broken json",
  }));
  assert.equal(resJson.status, 400);
  assert.deepEqual(await resJson.json(), { error: "INVALID_JSON" });
});

test("message route strictly rejects disallowed fields: workspaceId, audience, conversationId (400)", async () => {
  const { routes } = createHarness();
  const cookie = makeValidCookie();
  const headers = {
    cookie,
    origin: ALLOWED_ORIGIN,
    "content-type": "application/json",
  };

  for (const forbiddenKey of ["workspaceId", "audience", "conversationId"]) {
    const res = await routes.message(new Request("https://example.com/message", {
      method: "POST",
      headers,
      body: JSON.stringify({
        connectionId: TRUSTED_WORKSPACE.connectionId,
        text: "hello",
        [forbiddenKey]: "malicious-injection",
      }),
    }));

    assert.equal(res.status, 400, `Expected 400 for forbidden key: ${forbiddenKey}`);
    assert.deepEqual(await res.json(), { error: "DISALLOWED_FIELDS" });
  }
});

test("message route rejects connectionId mismatch between body and cookie (401)", async () => {
  const { routes } = createHarness();
  const cookie = makeValidCookie("conn-1"); // cookie is for conn-1

  const res = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: "conn-DIFFERENT", text: "hello" }),
  }));

  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "CONNECTION_MISMATCH" });
});

test("message route executes handoff action and calls requestHandoff with server-resolved workspace", async () => {
  const { routes, handoffCalls } = createHarness();
  const session = issueWebChatSession({ connectionId: TRUSTED_WORKSPACE.connectionId });
  const token = signSessionToken(session, TEST_SECRET);
  const cookie = `${WEB_CHAT_COOKIE_NAME}=${token}`;

  const res = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, action: "handoff" }),
  }));

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { kind: "handoff_recorded" });

  assert.equal(handoffCalls.length, 1);
  assert.equal(handoffCalls[0]!.workspace, TRUSTED_WORKSPACE);
  assert.equal(handoffCalls[0]!.conversationId, session.conversationId);
});

test("message route returns answer with title-only citation chips", async () => {
  const { routes, responderCalls } = createHarness();
  const session = issueWebChatSession({ connectionId: TRUSTED_WORKSPACE.connectionId });
  const token = signSessionToken(session, TEST_SECRET);
  const cookie = `${WEB_CHAT_COOKIE_NAME}=${token}`;

  const res = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "สอบถามเวลาทำการ" }),
  }));

  assert.equal(res.status, 200);
  const data = await res.json() as {
    kind: string;
    text: string;
    citations: { title: string }[];
  };

  assert.equal(data.kind, "answer");
  assert.equal(data.text, "ตอบสำหรับ: สอบถามเวลาทำการ");
  assert.equal(data.citations.length, 1);
  assert.equal(data.citations[0]!.title, "คู่มือการใช้งาน");
  assert.deepEqual(data.citations[0], { title: "คู่มือการใช้งาน" });

  // Verify responder was called with server-resolved workspace and cookie conversationId
  assert.equal(responderCalls.length, 1);
  assert.equal(responderCalls[0]!.workspace, TRUSTED_WORKSPACE);
  assert.equal(responderCalls[0]!.conversationId, session.conversationId);
  assert.equal(responderCalls[0]!.query, "สอบถามเวลาทำการ");
  assert.equal(responderCalls[0]!.audience, "customer");
});

test("page and message routes reject disallowed HTTP methods (405)", async () => {
  const { routes } = createHarness();
  const cookie = makeValidCookie();

  // POST on page
  const resPagePost = await routes.page(new Request(`https://example.com/chat?c=${TRUSTED_WORKSPACE.connectionId}`, {
    method: "POST",
  }));
  assert.equal(resPagePost.status, 405);
  assert.equal(resPagePost.headers.get("allow"), "GET, HEAD");

  // GET on message
  const resMsgGet = await routes.message(new Request("https://example.com/message", {
    method: "GET",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
    },
  }));
  assert.equal(resMsgGet.status, 405);
  assert.equal(resMsgGet.headers.get("allow"), "POST");
});

test("page and message routes reject empty or whitespace clientKey (400)", async () => {
  const { routes } = createHarness({
    clientKey: () => "",
  });
  const cookie = makeValidCookie();

  const resPage = await routes.page(new Request(`https://example.com/chat?c=${TRUSTED_WORKSPACE.connectionId}`));
  assert.equal(resPage.status, 400);

  const resMsg = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "hi" }),
  }));
  assert.equal(resMsg.status, 400);
  assert.deepEqual(await resMsg.json(), { error: "CLIENT_KEY_REQUIRED" });
});

test("message route returns 500 without leaking error details when responder or handoff throws", async () => {
  const cookie = makeValidCookie();

  // Responder throws internal error
  const { routes: routesWithExplodingResponder } = createHarness({
    responder: async () => {
      throw new Error("SECRET_INTERNAL_DB_CRASH_DETAILS_SHOULD_NEVER_LEAK");
    },
  });

  const res1 = await routesWithExplodingResponder.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "hi" }),
  }));
  assert.equal(res1.status, 500);
  const text1 = await res1.text();
  assert.doesNotMatch(text1, /SECRET_INTERNAL_DB_CRASH_DETAILS/);
  assert.deepEqual(JSON.parse(text1), { error: "INTERNAL_ERROR" });

  // Handoff throws internal error
  const { routes: routesWithExplodingHandoff } = createHarness({
    requestHandoff: async () => {
      throw new Error("SECRET_HANDOFF_QUEUE_FAILURE_DETAILS");
    },
  });

  const res2 = await routesWithExplodingHandoff.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, action: "handoff" }),
  }));
  assert.equal(res2.status, 500);
  const text2 = await res2.text();
  assert.doesNotMatch(text2, /SECRET_HANDOFF_QUEUE_FAILURE_DETAILS/);
  assert.deepEqual(JSON.parse(text2), { error: "INTERNAL_ERROR" });
});

test("message route aborts streamed body exceeding MAX_BODY_BYTES (413)", async () => {
  const { routes } = createHarness();
  const cookie = makeValidCookie();

  // Create a ReadableStream that yields chunks exceeding 16KiB
  let chunksPushed = 0;
  let canceled = false;
  const chunk = new Uint8Array(8_192); // 8 KiB chunks
  const stream = new ReadableStream({
    pull(controller) {
      if (chunksPushed < 5) { // 5 * 8KiB = 40KiB
        chunksPushed += 1;
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
    cancel() {
      canceled = true;
    },
  });

  const res = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
      // Note: no content-length header sent, simulating chunked stream
    },
    body: stream,
    ...({ duplex: "half" } as Record<string, unknown>),
  }));

  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: "PAYLOAD_TOO_LARGE" });
  assert.ok(canceled, "ReadableStream must be canceled when exceeding MAX_BODY_BYTES");
});

test("message route omits citation chip when describeCitation returns null", async () => {
  const { routes } = createHarness({
    responder: async () => ({
      kind: "answer",
      text: "ตอบ",
      citations: [
        {
          workspaceId: TRUSTED_WORKSPACE.workspaceId,
          sourceId: "src-unnamed", // describeCitation returns null for this
          sourceVersionId: "v-unknown",
          chunkId: "c-1",
          locator: { kind: "row" as const, row: 5 },
        },
      ],
      conversationVersion: 1,
    }),
  });
  const cookie = makeValidCookie();

  const res = await routes.message(new Request("https://example.com/message", {
    method: "POST",
    headers: {
      cookie,
      origin: ALLOWED_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "ถาม" }),
  }));

  assert.equal(res.status, 200);
  const data = await res.json() as { citations: unknown[] };
  assert.deepEqual(data.citations, []);
});

test("message route maps responder status to standardized HTTP responses", async () => {
  const cookie = makeValidCookie();
  const callWithReply = async (reply: SupportReply) => {
    const { routes } = createHarness({ responder: async () => reply });
    return routes.message(new Request("https://example.com/message", {
      method: "POST",
      headers: {
        cookie,
        origin: ALLOWED_ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "ทดสอบ" }),
    }));
  };

  // handoff_requested -> 200 uncertain
  const res1 = await callWithReply({ kind: "handoff_requested", reason: "NO_APPROVED_EVIDENCE" });
  assert.equal(res1.status, 200);
  const data1 = await res1.json() as { kind: string; text: string };
  assert.equal(data1.kind, "uncertain");
  assert.match(data1.text, /ไม่พบข้อมูลที่ยืนยันได้/);

  assert.equal((data1 as { handoff?: boolean }).handoff, undefined);
  assert.match(data1.text, /ส่งเรื่องให้พนักงานแล้ว/);

  // ai_paused -> 200 uncertain, already with staff: wait, do not press the button again
  const res2 = await callWithReply({ kind: "ai_paused" });
  assert.equal(res2.status, 200);
  const data2 = await res2.json() as { kind: string; text: string; handoff?: boolean };
  assert.equal(data2.kind, "uncertain");
  assert.equal(data2.handoff, true);
  assert.match(data2.text, /รอพนักงานตอบ/);
  assert.doesNotMatch(data2.text, /ไม่พบข้อมูล|กดปุ่ม/);

  // handoff_unavailable -> clearly disclose that staff could not be reached
  const res2b = await callWithReply({ kind: "handoff_unavailable", reason: "NO_APPROVED_EVIDENCE" });
  const data2b = await res2b.json() as { text: string; handoff?: boolean };
  assert.match(data2b.text, /ยังส่งเรื่องให้พนักงานไม่ได้/u);
  assert.equal(data2b.handoff, undefined);

  // conversation_changed -> 409
  const res3 = await callWithReply({ kind: "conversation_changed" });
  assert.equal(res3.status, 409);
  assert.deepEqual(await res3.json(), { error: "CONVERSATION_CHANGED" });

  // conversation_unavailable -> 503
  const res4 = await callWithReply({ kind: "conversation_unavailable" });
  assert.equal(res4.status, 503);
  assert.deepEqual(await res4.json(), { error: "SERVICE_UNAVAILABLE" });

  // invalid_request -> 400
  const res5 = await callWithReply({ kind: "invalid_request" });
  assert.equal(res5.status, 400);
  assert.deepEqual(await res5.json(), { error: "INVALID_REQUEST" });
});

test("message route de-duplicates citation titles and passes small talk through as a greeting", async () => {
  const citation = (chunkId: string) => ({
    workspaceId: TRUSTED_WORKSPACE.workspaceId,
    sourceId: "src-1",
    sourceVersionId: "v-1",
    chunkId,
    locator: { kind: "page" as const, page: 1 },
  });
  const post = async (reply: SupportReply | { kind: "small_talk"; text: string }) => {
    const { routes } = createHarness({ responder: async () => reply });
    const res = await routes.message(new Request("https://example.com/message", {
      method: "POST",
      headers: { cookie: makeValidCookie(), origin: ALLOWED_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ connectionId: TRUSTED_WORKSPACE.connectionId, text: "ทดสอบ" }),
    }));
    return res.json() as Promise<{ kind: string; text: string; citations?: unknown[] }>;
  };
  const answer = await post({ kind: "answer", text: "ตอบ", citations: [citation("c1"), citation("c2")], conversationVersion: 1 });
  assert.deepEqual(answer.citations, [{ title: "คู่มือการใช้งาน" }]);
  const greeting = await post({ kind: "small_talk", text: "สวัสดีครับ" });
  assert.deepEqual(greeting, { kind: "greeting", text: "สวัสดีครับ" });
});
