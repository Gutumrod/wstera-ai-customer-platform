import crypto from "node:crypto";

export const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_SESSION_TOKEN_CHARS = 512;
export const MIN_SECRET_BYTES = 32;
export const MAX_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const WEB_CHAT_COOKIE_NAME = "aicp_web_chat_session";

export type WebChatSession = Readonly<{
  conversationId: string;
  connectionId: string;
  expiresAt: number;
  createdAt: number;
}>;

export type CreateSessionCookieOptions = Readonly<{
  secure?: boolean;
  path?: string;
  maxAgeSeconds?: number;
}>;

export function assertSecret(secret: string): void {
  if (typeof secret !== "string" || secret.trim().length === 0) {
    throw new TypeError("sessionSecret is required and must be a non-empty string");
  }
  const byteLength = Buffer.byteLength(secret, "utf8");
  if (byteLength < MIN_SECRET_BYTES) {
    throw new TypeError(`sessionSecret must be at least ${MIN_SECRET_BYTES} bytes (utf-8)`);
  }
  const firstChar = secret[0];
  let allSame = true;
  for (let i = 1; i < secret.length; i++) {
    if (secret[i] !== firstChar) {
      allSame = false;
      break;
    }
  }
  if (allSame) {
    throw new TypeError("sessionSecret must not be a single repeating character");
  }
}

/**
 * Issues a new web chat session with a cryptographically random conversationId.
 */
export function issueWebChatSession(params: Readonly<{
  connectionId: string;
  ttlMs?: number;
  now?: () => number;
}>): WebChatSession {
  if (typeof params.connectionId !== "string" || params.connectionId.trim().length === 0) {
    throw new TypeError("connectionId must be a non-empty string");
  }
  const ttl = params.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > MAX_SESSION_TTL_MS) {
    throw new RangeError(`ttlMs must be a positive integer not exceeding ${MAX_SESSION_TTL_MS} ms`);
  }
  const currentTime = (params.now ?? Date.now)();

  return Object.freeze({
    conversationId: crypto.randomUUID(),
    connectionId: params.connectionId,
    createdAt: currentTime,
    expiresAt: currentTime + ttl,
  });
}

/**
 * Signs session payload into a compact token: base64url(payload).base64url(hmac).
 */
export function signSessionToken(session: WebChatSession, secret: string): string {
  assertSecret(secret);
  const payloadJson = JSON.stringify({
    conversationId: session.conversationId,
    connectionId: session.connectionId,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
  });
  const encodedPayload = Buffer.from(payloadJson, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

/**
 * Validates token signature, canonical base64url encoding, and token freshness.
 * Returns decoded session record or null.
 */
export function inspectSessionToken(
  token: string,
  secret: string,
  now: () => number = Date.now,
): WebChatSession | null {
  assertSecret(secret);
  if (typeof token !== "string" || token.length > MAX_SESSION_TOKEN_CHARS) return null;

  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

  const encodedPayload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  // Constant-time HMAC comparison
  const expectedSigBuffer = crypto.createHmac("sha256", secret).update(encodedPayload).digest();
  let actualSigBuffer: Buffer;
  try {
    actualSigBuffer = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }

  // Canonical base64url check: re-encoding must strictly equal original signature
  // (rejects trailing padding, extra characters, and alternate unused bits)
  if (actualSigBuffer.toString("base64url") !== signature) {
    return null;
  }

  if (actualSigBuffer.length !== expectedSigBuffer.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(actualSigBuffer, expectedSigBuffer)) {
    return null;
  }

  let parsed: unknown;
  try {
    const jsonStr = Buffer.from(encodedPayload, "base64url").toString("utf8");
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const conversationId = record.conversationId;
  const connectionId = record.connectionId;
  const expiresAt = record.expiresAt;
  const createdAt = record.createdAt;

  if (typeof conversationId !== "string" || conversationId.length === 0) return null;
  if (typeof connectionId !== "string" || connectionId.length === 0) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
  if (typeof createdAt !== "number" || !Number.isFinite(createdAt)) return null;

  // Check expiration (inclusive: <= currentTime is expired)
  const currentTime = now();
  if (expiresAt <= currentTime) {
    return null;
  }

  return Object.freeze({
    conversationId,
    connectionId,
    expiresAt,
    createdAt,
  });
}

/**
 * Verifies and parses session token using constant-time comparison.
 * Requires mandatory connectionId binding — rejects tampered signatures,
 * expired tokens, or connection mismatches.
 */
export function verifySessionToken(
  token: string,
  secret: string,
  expectedConnectionId: string,
  now: () => number = Date.now,
): WebChatSession | null {
  if (typeof expectedConnectionId !== "string" || expectedConnectionId.trim().length === 0) {
    return null;
  }
  const session = inspectSessionToken(token, secret, now);
  if (!session) return null;

  if (session.connectionId !== expectedConnectionId) {
    return null;
  }

  return session;
}

/**
 * Explicit connection-bound session verifier.
 */
export const verifySessionForConnection = verifySessionToken;

/**
 * Extracts cookie value by name from Cookie header string.
 * Rejects ambiguous duplicate cookie names by returning null.
 */
export function getCookieValue(cookieHeader: string | null, cookieName: string = WEB_CHAT_COOKIE_NAME): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  let foundValue: string | null = null;
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(`${cookieName}=`)) {
      if (foundValue !== null) {
        // Reject duplicate cookie ambiguity
        return null;
      }
      foundValue = trimmed.slice(cookieName.length + 1);
    }
  }
  return foundValue;
}

/**
 * Inspects session directly from Cookie header string without connection binding.
 */
export function inspectSessionCookie(
  cookieHeader: string | null,
  secret: string,
  now: () => number = Date.now,
): WebChatSession | null {
  const rawToken = getCookieValue(cookieHeader, WEB_CHAT_COOKIE_NAME);
  if (!rawToken) return null;
  return inspectSessionToken(rawToken, secret, now);
}

/**
 * Parses and verifies session directly from Cookie header string with mandatory connection binding.
 */
export function parseSessionCookie(
  cookieHeader: string | null,
  secret: string,
  expectedConnectionId: string,
  now: () => number = Date.now,
): WebChatSession | null {
  if (typeof expectedConnectionId !== "string" || expectedConnectionId.trim().length === 0) {
    return null;
  }
  const rawToken = getCookieValue(cookieHeader, WEB_CHAT_COOKIE_NAME);
  if (!rawToken) return null;
  return verifySessionToken(rawToken, secret, expectedConnectionId, now);
}

/**
 * Formats Set-Cookie header value for the web chat session.
 * Always sets HttpOnly and SameSite=Strict.
 */
export function formatSessionSetCookie(
  session: WebChatSession,
  secret: string,
  options?: CreateSessionCookieOptions,
): string {
  const token = signSessionToken(session, secret);
  const path = options?.path ?? "/";
  if (!/^\/[A-Za-z0-9._~/-]*$/.test(path)) {
    throw new TypeError("Invalid cookie path");
  }
  const secure = options?.secure !== false; // defaults to true unless explicitly false
  const maxAge = options?.maxAgeSeconds ?? Math.max(0, Math.floor((session.expiresAt - session.createdAt) / 1000));

  const parts = [
    `${WEB_CHAT_COOKIE_NAME}=${token}`,
    `Path=${path}`,
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
