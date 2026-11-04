import crypto from "node:crypto";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import type { KnowledgeCitation, KnowledgeCitationLocator } from "../contracts/data/knowledge.js";
import type { SupportReply } from "../modules/ai-engine/support-orchestrator.js";
import { createRateLimiter, type RateLimit } from "../apps/merchant-console/lib/rate-limit.js";
import {
  issueWebChatSession,
  parseSessionCookie,
  inspectSessionCookie,
  formatSessionSetCookie,
} from "./web-chat-session.js";
import { renderChatPage } from "../apps/web-chat/render-chat-page.js";

export const MAX_BODY_BYTES = 16_384;
export const MAX_QUERY_CHARS = 5_000;

export type SupportResponder = (input: Readonly<{
  workspace: TrustedWorkspaceContext;
  conversationId: string;
  query: string;
  audience: "customer";
}>) => Promise<SupportReply>;

export type CitationDescription = Readonly<{
  title: string;
}>;

export type WebChatRoutesDeps = Readonly<{
  messageEndpoint: string;
  resolveConnection: (connectionId: string, channel: "web") => Promise<TrustedWorkspaceContext | null>;
  allowedOrigins: (connection: TrustedWorkspaceContext) => Promise<readonly string[]> | readonly string[];
  sessionSecret: string;
  responder: SupportResponder;
  requestHandoff: (workspace: TrustedWorkspaceContext, conversationId: string) => Promise<void>;
  describeCitation?: (workspace: TrustedWorkspaceContext, citation: KnowledgeCitation) => Promise<CitationDescription | null>;
  clientKey: (request: Request) => string;
  limits?: Readonly<{
    session?: RateLimit;
    client?: RateLimit;
  }>;
  secureCookie?: boolean;
  now?: () => number;
}>;

export type CitationChip = Readonly<{
  title: string;
  sourceVersionId: string;
  position?: string;
  locator?: KnowledgeCitationLocator;
}>;

function formatLocatorPosition(locator: KnowledgeCitationLocator): string {
  switch (locator.kind) {
    case "page":
      return `หน้า ${locator.page}`;
    case "row":
      return `แถว ${locator.row}`;
    case "span":
      return `ช่วง ${locator.start}-${locator.end}`;
    case "chunk":
      return `ส่วนที่ ${locator.chunkIndex + 1}`;
    default:
      return "";
  }
}

function jsonResponse(status: number, data: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function jsonErrorResponse(status: number, error: string, headers: Record<string, string> = {}): Response {
  return jsonResponse(status, { error }, headers);
}

function rateLimitResponse(retryAfterSeconds: number): Response {
  return jsonErrorResponse(429, "RATE_LIMITED", {
    "Retry-After": String(retryAfterSeconds),
  });
}

type ValidatedBody =
  | Readonly<{ kind: "chat"; connectionId: string; text: string }>
  | Readonly<{ kind: "handoff"; connectionId: string }>;

function parseAndValidateBody(rawBody: string): { ok: true; body: ValidatedBody } | { ok: false; status: number; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, error: "INVALID_JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, status: 400, error: "INVALID_BODY" };
  }

  const keys = Object.keys(parsed);

  // Strictly reject forbidden fields
  if (keys.includes("workspaceId") || keys.includes("audience") || keys.includes("conversationId")) {
    return { ok: false, status: 400, error: "DISALLOWED_FIELDS" };
  }

  const record = parsed as Record<string, unknown>;
  const connectionId = record.connectionId;
  if (typeof connectionId !== "string" || connectionId.trim().length === 0) {
    return { ok: false, status: 400, error: "INVALID_CONNECTION_ID" };
  }

  if ("action" in record) {
    if (keys.length !== 2 || record.action !== "handoff") {
      return { ok: false, status: 400, error: "INVALID_ACTION" };
    }
    return { ok: true, body: { kind: "handoff", connectionId } };
  }

  if ("text" in record) {
    if (keys.length !== 2 || typeof record.text !== "string" || record.text.trim().length === 0 || record.text.length > MAX_QUERY_CHARS) {
      return { ok: false, status: 400, error: "INVALID_TEXT" };
    }
    return { ok: true, body: { kind: "chat", connectionId, text: record.text } };
  }

  return { ok: false, status: 400, error: "INVALID_BODY" };
}

/**
 * Bounds request body reading during streaming to prevent unbounded memory/CPU DoS.
 */
async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; status: 413 | 400; error: string }> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { ok: false, status: 413, error: "PAYLOAD_TOO_LARGE" };
    }
  }

  if (request.body && typeof request.body.getReader === "function") {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel("PAYLOAD_TOO_LARGE");
            return { ok: false, status: 413, error: "PAYLOAD_TOO_LARGE" };
          }
          chunks.push(value);
        }
      }
      const combined = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { ok: true, text: new TextDecoder("utf-8").decode(combined) };
    } catch {
      return { ok: false, status: 400, error: "INVALID_BODY" };
    }
  }

  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      return { ok: false, status: 413, error: "PAYLOAD_TOO_LARGE" };
    }
    return { ok: true, text };
  } catch {
    return { ok: false, status: 400, error: "INVALID_BODY" };
  }
}

const SAME_ORIGIN_PATH = /^\/(?![/\\])[^\s\u0000-\u001F\\]*$/u;

export function createWebChatRoutes(deps: WebChatRoutesDeps) {
  if (
    typeof deps.messageEndpoint !== "string" ||
    deps.messageEndpoint.trim().length === 0 ||
    // Same-origin path only: "//host" and "/\host" read as another origin; spaces and control chars are never valid.
    !SAME_ORIGIN_PATH.test(deps.messageEndpoint)
  ) {
    throw new Error(`messageEndpoint must be a non-empty absolute path starting with "/": got ${JSON.stringify(deps.messageEndpoint)}`);
  }
  const now = deps.now ?? Date.now;
  const clientLimiter = createRateLimiter(deps.limits?.client ?? { limit: 60, windowMs: 60_000 }, 10_000, now);
  const sessionLimiter = createRateLimiter(deps.limits?.session ?? { limit: 20, windowMs: 60_000 }, 10_000, now);

  return Object.freeze({
    async page(request: Request): Promise<Response> {
      // Method check (LOW-2)
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        });
      }

      // Client key validation (LOW-4)
      const clientKey = deps.clientKey(request);
      if (typeof clientKey !== "string" || clientKey.trim().length === 0) {
        return new Response("Bad Request", { status: 400 });
      }

      // Rate limit per client before calling resolveConnection (MEDIUM-2)
      const clientRetry = clientLimiter.retryAfterSeconds(clientKey);
      if (clientRetry > 0) {
        return rateLimitResponse(clientRetry);
      }

      let connectionId: string | null = null;
      try {
        const url = new URL(request.url);
        connectionId = url.searchParams.get("c");
      } catch {
        return new Response("Not Found", { status: 404 });
      }

      if (!connectionId || connectionId.trim().length === 0) {
        return new Response("Not Found", { status: 404 });
      }

      // Must resolve connection server-side first; do not set cookie if resolve fails
      const workspace = await deps.resolveConnection(connectionId, "web");
      if (!workspace) {
        return new Response("Not Found", { status: 404 });
      }

      const cookieHeader = request.headers.get("cookie");
      const existingSession = parseSessionCookie(cookieHeader, deps.sessionSecret, connectionId, now);

      let session = existingSession;
      let setCookieHeader: string | null = null;

      if (!session) {
        session = issueWebChatSession({ connectionId, now });
        setCookieHeader = formatSessionSetCookie(session, deps.sessionSecret, {
          secure: deps.secureCookie !== false,
        });
      }

      const nonce = crypto.randomBytes(16).toString("base64");
      const html = renderChatPage({
        connectionId,
        nonce,
        messageEndpoint: deps.messageEndpoint,
      });

      const csp = [
        "default-src 'none'",
        `script-src 'nonce-${nonce}'`,
        `style-src 'nonce-${nonce}'`,
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; ");

      const responseHeaders: Record<string, string> = {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": csp,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      };

      if (setCookieHeader) {
        responseHeaders["set-cookie"] = setCookieHeader;
      }

      return new Response(html, {
        status: 200,
        headers: responseHeaders,
      });
    },

    async message(request: Request): Promise<Response> {
      // Method check (LOW-2)
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        });
      }

      // Client key validation (LOW-4)
      const clientKey = deps.clientKey(request);
      if (typeof clientKey !== "string" || clientKey.trim().length === 0) {
        return jsonErrorResponse(400, "CLIENT_KEY_REQUIRED");
      }

      // 1. Rate limit per client (429)
      const clientRetry = clientLimiter.retryAfterSeconds(clientKey);
      if (clientRetry > 0) {
        return rateLimitResponse(clientRetry);
      }

      // 2. Cookie signature, canonical encoding, and expiration check (401)
      const cookieHeader = request.headers.get("cookie");
      const session = inspectSessionCookie(cookieHeader, deps.sessionSecret, now);
      if (!session) {
        return jsonErrorResponse(401, "UNAUTHENTICATED");
      }

      // 3. Resolve connection: resolveConnection(cookie.connectionId, "web") (404 neutral)
      const workspace = await deps.resolveConnection(session.connectionId, "web");
      if (!workspace) {
        return jsonErrorResponse(404, "NOT_FOUND");
      }

      // 4. Origin matching allowedOrigins(connection) (403, missing origin = 403)
      const origin = request.headers.get("origin");
      if (!origin) {
        return jsonErrorResponse(403, "ORIGIN_REQUIRED");
      }
      const allowed = await deps.allowedOrigins(workspace);
      if (!allowed.includes(origin)) {
        return jsonErrorResponse(403, "ORIGIN_DENIED");
      }

      // 5. Content-Type check (415)
      const contentType = request.headers.get("content-type");
      if (!contentType || !contentType.toLowerCase().startsWith("application/json")) {
        return jsonErrorResponse(415, "UNSUPPORTED_MEDIA_TYPE");
      }

      // 6. Rate limit per session (429) - must occur before reading body
      // Keyed by connectionId + conversationId to close cookie-dropping avoidance
      const sessionKey = `${session.connectionId}:${session.conversationId}`;
      const sessionRetry = sessionLimiter.retryAfterSeconds(sessionKey);
      if (sessionRetry > 0) {
        return rateLimitResponse(sessionRetry);
      }

      // 7. Read body: stream-bounded size check (413), JSON parsing and validation (400)
      const bodyResult = await readBoundedBody(request, MAX_BODY_BYTES);
      if (!bodyResult.ok) {
        return jsonErrorResponse(bodyResult.status, bodyResult.error);
      }

      const validation = parseAndValidateBody(bodyResult.text);
      if (!validation.ok) {
        return jsonErrorResponse(validation.status, validation.error);
      }

      const body = validation.body;

      // 8. connectionId in body must match cookie (401)
      if (!parseSessionCookie(cookieHeader, deps.sessionSecret, body.connectionId, now)) {
        return jsonErrorResponse(401, "CONNECTION_MISMATCH");
      }

      // Dispatch actions
      if (body.kind === "handoff") {
        try {
          await deps.requestHandoff(workspace, session.conversationId);
          return jsonResponse(200, { kind: "handoff_recorded" });
        } catch {
          return jsonErrorResponse(500, "INTERNAL_ERROR");
        }
      }

      // Chat query handling
      try {
        const reply = await deps.responder({
          workspace,
          conversationId: session.conversationId,
          query: body.text,
          audience: "customer",
        });

        switch (reply.kind) {
          case "answer": {
            const chips: CitationChip[] = [];
            if (reply.citations && Array.isArray(reply.citations)) {
              for (const citation of reply.citations) {
                if (deps.describeCitation) {
                  const desc = await deps.describeCitation(workspace, citation);
                  if (desc && typeof desc.title === "string" && desc.title.trim().length > 0) {
                    chips.push({
                      title: desc.title,
                      sourceVersionId: citation.sourceVersionId,
                      position: formatLocatorPosition(citation.locator),
                      locator: citation.locator,
                    });
                  }
                }
              }
            }
            return jsonResponse(200, {
              kind: "answer",
              text: reply.text,
              citations: chips,
            });
          }

          case "handoff_requested":
          case "handoff_unavailable":
          case "ai_paused":
            return jsonResponse(200, {
              kind: "uncertain",
              text: "ขออภัยครับ ไม่พบข้อมูลที่ยืนยันได้ในระบบ หากต้องการสอบถามเพิ่มเติม สามารถกดปุ่มขอคุยกับพนักงานได้ครับ",
            });

          case "conversation_changed":
            return jsonErrorResponse(409, "CONVERSATION_CHANGED");

          case "conversation_unavailable":
            return jsonErrorResponse(503, "SERVICE_UNAVAILABLE");

          case "invalid_request":
            return jsonErrorResponse(400, "INVALID_REQUEST");

          default:
            return jsonErrorResponse(500, "INTERNAL_ERROR");
        }
      } catch {
        return jsonErrorResponse(500, "INTERNAL_ERROR");
      }
    },
  });
}
