import assert from "node:assert/strict";
import test from "node:test";
import {
  issueWebChatSession,
  signSessionToken,
  verifySessionToken,
  parseSessionCookie,
  formatSessionSetCookie,
  WEB_CHAT_COOKIE_NAME,
} from "./web-chat-session.js";

const TEST_SECRET = "super-secret-key-at-least-32-bytes-long-for-hmac";

test("issues session with valid UUID conversationId and given connectionId", () => {
  const session = issueWebChatSession({
    connectionId: "conn-123",
  });

  assert.equal(session.connectionId, "conn-123");
  assert.match(session.conversationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.ok(session.expiresAt > session.createdAt);
});

test("signs and verifies valid session token", () => {
  const session = issueWebChatSession({ connectionId: "conn-abc" });
  const token = signSessionToken(session, TEST_SECRET);

  const verified = verifySessionToken(token, TEST_SECRET, "conn-abc");
  assert.ok(verified);
  assert.equal(verified.conversationId, session.conversationId);
  assert.equal(verified.connectionId, session.connectionId);
});

test("rejects forged or tampered signature", () => {
  const session = issueWebChatSession({ connectionId: "conn-abc" });
  const token = signSessionToken(session, TEST_SECRET);

  // Alter the payload part
  const [payloadPart, sigPart] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payloadPart!, "base64url").toString());
  decoded.connectionId = "conn-hacked";
  const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");
  const forgedToken = `${tamperedPayload}.${sigPart}`;

  assert.equal(verifySessionToken(forgedToken, TEST_SECRET), null);

  // Alter with different secret
  assert.equal(verifySessionToken(token, "wrong-secret-key-which-should-fail"), null);

  // Alter signature characters
  const alteredSigToken = `${payloadPart}.${sigPart!.slice(0, -2)}AA`;
  assert.equal(verifySessionToken(alteredSigToken, TEST_SECRET), null);
});

test("rejects expired session token", () => {
  let currentTime = 1_000_000;
  const session = issueWebChatSession({
    connectionId: "conn-exp",
    ttlMs: 5_000,
    now: () => currentTime,
  });
  const token = signSessionToken(session, TEST_SECRET);

  // Valid before expiration
  assert.ok(verifySessionToken(token, TEST_SECRET, undefined, () => currentTime + 1_000));

  // Expired
  assert.equal(verifySessionToken(token, TEST_SECRET, undefined, () => currentTime + 5_001), null);
});

test("rejects connectionId mismatch", () => {
  const session = issueWebChatSession({ connectionId: "conn-owner" });
  const token = signSessionToken(session, TEST_SECRET);

  assert.equal(verifySessionToken(token, TEST_SECRET, "conn-other"), null);
});

test("parses cookie from Cookie header string correctly", () => {
  const session = issueWebChatSession({ connectionId: "conn-1" });
  const token = signSessionToken(session, TEST_SECRET);
  const cookieHeader = `other_cookie=123; ${WEB_CHAT_COOKIE_NAME}=${token}; tracking=abc`;

  const parsed = parseSessionCookie(cookieHeader, TEST_SECRET, "conn-1");
  assert.ok(parsed);
  assert.equal(parsed.conversationId, session.conversationId);

  // Missing cookie
  assert.equal(parseSessionCookie("other=foo", TEST_SECRET), null);
  assert.equal(parseSessionCookie(null, TEST_SECRET), null);
});

test("formatSessionSetCookie sets HttpOnly, SameSite=Strict, and Secure flag", () => {
  const session = issueWebChatSession({ connectionId: "conn-1" });
  const setCookieSecure = formatSessionSetCookie(session, TEST_SECRET, { secure: true });

  assert.match(setCookieSecure, new RegExp(`^${WEB_CHAT_COOKIE_NAME}=`));
  assert.match(setCookieSecure, /HttpOnly/);
  assert.match(setCookieSecure, /SameSite=Strict/);
  assert.match(setCookieSecure, /Secure/);

  const setCookieInsecure = formatSessionSetCookie(session, TEST_SECRET, { secure: false });
  assert.doesNotMatch(setCookieInsecure, /Secure/);
});

test("assertSecret rejects empty or invalid secret", () => {
  const session = issueWebChatSession({ connectionId: "conn-1" });
  assert.throws(() => signSessionToken(session, ""), TypeError);
  assert.throws(() => verifySessionToken("a.b", ""), TypeError);
});
