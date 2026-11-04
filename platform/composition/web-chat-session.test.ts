import assert from "node:assert/strict";
import test from "node:test";
import {
  issueWebChatSession,
  signSessionToken,
  verifySessionToken,
  inspectSessionToken,
  parseSessionCookie,
  inspectSessionCookie,
  formatSessionSetCookie,
  WEB_CHAT_COOKIE_NAME,
} from "./web-chat-session.js";

const TEST_SECRET = "super-secret-key-at-least-32-bytes-long-for-hmac";

test("issues session with valid UUID conversationId and given connectionId", () => {
  const session1 = issueWebChatSession({ connectionId: "conn-123" });
  const session2 = issueWebChatSession({ connectionId: "conn-123" });

  assert.equal(session1.connectionId, "conn-123");
  assert.match(session1.conversationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.notEqual(session1.conversationId, session2.conversationId, "conversationId must be unique");
  assert.ok(session1.expiresAt > session1.createdAt);
});

test("issueWebChatSession enforces invariants and rejects invalid connectionId or ttlMs", () => {
  assert.throws(() => issueWebChatSession({ connectionId: "" }), TypeError);
  assert.throws(() => issueWebChatSession({ connectionId: "  " }), TypeError);
  assert.throws(() => issueWebChatSession({ connectionId: "c", ttlMs: 0 }), RangeError);
  assert.throws(() => issueWebChatSession({ connectionId: "c", ttlMs: -100 }), RangeError);
  assert.throws(() => issueWebChatSession({ connectionId: "c", ttlMs: 10 * 24 * 60 * 60 * 1000 }), RangeError);
});

test("signs and verifies valid session token", () => {
  const session = issueWebChatSession({ connectionId: "conn-abc" });
  const token = signSessionToken(session, TEST_SECRET);

  const verified = verifySessionToken(token, TEST_SECRET, "conn-abc");
  assert.ok(verified);
  assert.equal(verified.conversationId, session.conversationId);
  assert.equal(verified.connectionId, session.connectionId);

  const inspected = inspectSessionToken(token, TEST_SECRET);
  assert.ok(inspected);
  assert.equal(inspected.conversationId, session.conversationId);
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

  assert.equal(verifySessionToken(forgedToken, TEST_SECRET, "conn-abc"), null);

  // Alter with different secret
  assert.equal(verifySessionToken(token, "wrong-secret-key-which-should-fail-32b", "conn-abc"), null);

  // Alter signature characters
  const alteredSigToken = `${payloadPart}.${sigPart!.slice(0, -2)}AA`;
  assert.equal(verifySessionToken(alteredSigToken, TEST_SECRET, "conn-abc"), null);
});

test("rejects tampered base64url signature variants (signature malleability)", () => {
  const session = issueWebChatSession({ connectionId: "conn-abc" });
  const token = signSessionToken(session, TEST_SECRET);
  const [payloadPart, sigPart] = token.split(".");

  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const lastChar = sigPart![sigPart!.length - 1]!;
  const idx = alpha.indexOf(lastChar);
  const base = idx & 0b111100;
  const alternates = [alpha[base]!, alpha[base + 1]!, alpha[base + 2]!, alpha[base + 3]!].filter((c) => c !== lastChar);
  const alternateSig = sigPart!.slice(0, -1) + alternates[0];

  assert.equal(verifySessionToken(`${payloadPart}.${alternateSig}`, TEST_SECRET, "conn-abc"), null);
  assert.equal(verifySessionToken(`${payloadPart}.${sigPart}===`, TEST_SECRET, "conn-abc"), null);
  assert.equal(verifySessionToken(`${payloadPart}.${sigPart}!!!`, TEST_SECRET, "conn-abc"), null);
});

test("rejects signature length mismatch without throwing", () => {
  const session = issueWebChatSession({ connectionId: "conn-abc" });
  const token = signSessionToken(session, TEST_SECRET);
  const [payloadPart, sigPart] = token.split(".");

  // Truncated signature (30 bytes instead of 32 bytes)
  const shortSig = sigPart!.slice(0, 40);
  assert.equal(verifySessionToken(`${payloadPart}.${shortSig}`, TEST_SECRET, "conn-abc"), null);

  // Extended signature (longer than 32 bytes)
  const longSig = `${sigPart}AAAA`;
  assert.equal(verifySessionToken(`${payloadPart}.${longSig}`, TEST_SECRET, "conn-abc"), null);
});

test("rejects expired session token including exact boundary", () => {
  let currentTime = 1_000_000;
  const session = issueWebChatSession({
    connectionId: "conn-exp",
    ttlMs: 5_000,
    now: () => currentTime,
  });
  const token = signSessionToken(session, TEST_SECRET);

  // Valid before expiration
  assert.ok(verifySessionToken(token, TEST_SECRET, "conn-exp", () => currentTime + 1_000));

  // Boundary: expiresAt === now is expired (inclusive)
  assert.equal(verifySessionToken(token, TEST_SECRET, "conn-exp", () => currentTime + 5_000), null);

  // Expired
  assert.equal(verifySessionToken(token, TEST_SECRET, "conn-exp", () => currentTime + 5_001), null);
});

test("rejects connectionId mismatch and requires non-empty expectedConnectionId", () => {
  const session = issueWebChatSession({ connectionId: "conn-owner" });
  const token = signSessionToken(session, TEST_SECRET);

  assert.equal(verifySessionToken(token, TEST_SECRET, "conn-other"), null);
  assert.equal(verifySessionToken(token, TEST_SECRET, ""), null);
  assert.equal(verifySessionToken(token, TEST_SECRET, "  "), null);
});

test("parses cookie from Cookie header string correctly and rejects duplicate cookies", () => {
  const session = issueWebChatSession({ connectionId: "conn-1" });
  const token = signSessionToken(session, TEST_SECRET);
  const cookieHeader = `other_cookie=123; ${WEB_CHAT_COOKIE_NAME}=${token}; tracking=abc`;

  const parsed = parseSessionCookie(cookieHeader, TEST_SECRET, "conn-1");
  assert.ok(parsed);
  assert.equal(parsed.conversationId, session.conversationId);

  const inspected = inspectSessionCookie(cookieHeader, TEST_SECRET);
  assert.ok(inspected);
  assert.equal(inspected.conversationId, session.conversationId);

  // Missing cookie
  assert.equal(parseSessionCookie("other=foo", TEST_SECRET, "conn-1"), null);
  assert.equal(parseSessionCookie(null, TEST_SECRET, "conn-1"), null);

  // Duplicate cookie name must be rejected as ambiguous
  const duplicateHeader = `${WEB_CHAT_COOKIE_NAME}=token1; ${WEB_CHAT_COOKIE_NAME}=token2`;
  assert.equal(parseSessionCookie(duplicateHeader, TEST_SECRET, "conn-1"), null);
});

test("formatSessionSetCookie sets HttpOnly, SameSite=Strict, and Secure flag, and rejects invalid path", () => {
  const session = issueWebChatSession({ connectionId: "conn-1" });
  const setCookieSecure = formatSessionSetCookie(session, TEST_SECRET, { secure: true });

  assert.match(setCookieSecure, new RegExp(`^${WEB_CHAT_COOKIE_NAME}=`));
  assert.match(setCookieSecure, /HttpOnly/);
  assert.match(setCookieSecure, /SameSite=Strict/);
  assert.match(setCookieSecure, /Secure/);

  const setCookieInsecure = formatSessionSetCookie(session, TEST_SECRET, { secure: false });
  assert.doesNotMatch(setCookieInsecure, /Secure/);

  // Custom valid path
  const customPathCookie = formatSessionSetCookie(session, TEST_SECRET, { path: "/chat" });
  assert.match(customPathCookie, /Path=\/chat/);

  // Invalid path throws TypeError
  assert.throws(() => formatSessionSetCookie(session, TEST_SECRET, { path: "/evil\r\nSet-Cookie: pwned" }), TypeError);
  assert.throws(() => formatSessionSetCookie(session, TEST_SECRET, { path: "/evil; Secure" }), TypeError);
});

test("assertSecret rejects empty, short (<32 bytes), or repeating character secret", () => {
  const session = issueWebChatSession({ connectionId: "conn-1" });
  assert.throws(() => signSessionToken(session, ""), TypeError);
  assert.throws(() => verifySessionToken("a.b", "", "conn-1"), TypeError);

  // Less than 32 bytes
  assert.throws(() => signSessionToken(session, "short-secret-under-32-bytes"), TypeError);
  assert.throws(() => verifySessionToken("a.b", "short-secret-under-32-bytes", "conn-1"), TypeError);

  // Single repeating character (even if >= 32 bytes)
  assert.throws(() => signSessionToken(session, "a".repeat(40)), TypeError);
  assert.throws(() => verifySessionToken("a.b", "1".repeat(64), "conn-1"), TypeError);
});

test("inspectSessionToken rejects oversized tokens or malformed payload", () => {
  // Token > 512 chars
  const hugeToken = "a".repeat(513) + ".sig";
  assert.equal(inspectSessionToken(hugeToken, TEST_SECRET), null);

  // Token without dot
  assert.equal(inspectSessionToken("nodothere", TEST_SECRET), null);

  // Token starting or ending with dot
  assert.equal(inspectSessionToken(".endsig", TEST_SECRET), null);
  assert.equal(inspectSessionToken("payload.", TEST_SECRET), null);
});
