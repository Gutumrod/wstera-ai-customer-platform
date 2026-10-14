import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { createTrustedWorkspace, enforceWorkspace } from "../core/workspace.js";
import { verifyLineSignature } from "../line/signature.js";
import { parseSignedLineTextEvents } from "../line/ingress.js";
import { LineHttpError, sendLineReply } from "../line/client.js";
import { evaluateAnswerSources } from "../policy/answer-gate.js";

const raw = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);
const sign = (body: Uint8Array<ArrayBuffer>, secret: string): string =>
  createHmac("sha256", secret).update(body).digest("base64");

test("trusted workspace enforces a strict, immutable context", () => {
  const ctx = createTrustedWorkspace({ workspaceId: "shop-1", connectionId: "conn-1", channel: "line" });
  assert.equal(Object.isFrozen(ctx), true);
  assert.throws(() => createTrustedWorkspace({ workspaceId: "", connectionId: "x", channel: "line" }));
  assert.throws(() => enforceWorkspace(ctx, "shop-2"), /CROSS_WORKSPACE/);
});

test("LINE HMAC verifies raw bytes and rejects modifications/missing secret", async () => {
  const body = raw('{"destination":"Uxxx","events":[]}');
  const signature = sign(body, "test-secret");
  assert.equal(await verifyLineSignature(body, signature, "test-secret"), true);
  assert.equal(await verifyLineSignature(raw('{"destination":"Uyyy","events":[]}'), signature, "test-secret"), false);
  assert.equal(await verifyLineSignature(body, null, "test-secret"), false);
  assert.equal(await verifyLineSignature(body, signature, ""), false);
});

test("signed LINE ingress is bound to server-owned destination and filters group messages", async () => {
  const payload = JSON.stringify({
    destination: "U_destination",
    events: [
      { type: "message", webhookEventId: "ev-1", timestamp: 123, replyToken: "reply", message: {type:"text",text:"สวัสดี"}, source:{type:"user",userId:"Uuser"} },
      { type: "message", webhookEventId: "ev-2", timestamp: 124, replyToken: "reply-2", message: {type:"text",text:"group"}, source:{type:"group",groupId:"Ggroup"} },
    ],
  });
  const body = raw(payload);
  const lookup = async (destination: string) => destination === "U_destination"
    ? {workspaceId:"shop-1",connectionId:"conn-1",channelSecret:"secret"} : null;
  const events = await parseSignedLineTextEvents(body, sign(body,"secret"), lookup);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.workspace.workspaceId, "shop-1");
  assert.equal(events[0]?.text, "สวัสดี");
  await assert.rejects(() => parseSignedLineTextEvents(body, sign(body, "wrong"), lookup), /INVALID_LINE_SIGNATURE/);
  await assert.rejects(() => parseSignedLineTextEvents(body, sign(body, "secret"), async () => null), /UNKNOWN_LINE_CONNECTION/);
});

test("the source gate refuses cross-shop knowledge and requires approved excerpts", () => {
  const ctx = createTrustedWorkspace({workspaceId:"shop-1",connectionId:"c",channel:"web"});
  assert.deepEqual(evaluateAnswerSources(ctx, []), { kind: "handoff", reason: "NO_APPROVED_KNOWLEDGE" });
  assert.deepEqual(evaluateAnswerSources(ctx, [{workspaceId:"shop-1",sourceId:"doc",excerpt:"text",approved:false}]), { kind:"handoff", reason:"NO_APPROVED_KNOWLEDGE" });
  assert.equal(evaluateAnswerSources(ctx, [{workspaceId:"shop-1",sourceId:"doc",excerpt:"text",approved:true}]).kind, "candidate_context");
  assert.throws(() => evaluateAnswerSources(ctx, [{workspaceId:"shop-2",sourceId:"doc",excerpt:"secret",approved:true}]), /CROSS_WORKSPACE/);
});

test("reply client rejects missing creds and surfaces provider failure", async () => {
  await assert.rejects(() => sendLineReply({accessToken:"",replyToken:"x",messages:[{type:"text",text:"hi"}]}), /INVALID_LINE_REPLY_INPUT/);
  await assert.rejects(() => sendLineReply(
    {accessToken:"fake",replyToken:"x",messages:[{type:"text",text:"hi"}]},
    async () => new Response("forbidden", {status:403}),
  ), (err: unknown) => err instanceof LineHttpError && err.status === 403);
});
