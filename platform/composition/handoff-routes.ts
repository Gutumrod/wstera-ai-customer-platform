import { HandoffServiceError, type HandoffService } from "./handoff-service.js";
import type { MerchantIdentity } from "../modules/tenancy/merchant-identity.js";
import { MerchantIdentityError } from "../modules/tenancy/merchant-identity.js";

type HandoffHost = Readonly<{ identity: MerchantIdentity; service: HandoffService }>;
const noStore = { "Cache-Control": "no-store" };
const conversationIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
class RouteError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
function assertOrigin(request: Request, read = false) {
  const origin = request.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).origin === new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").origin) return; } catch { /* fail closed */ }
    throw new RouteError(403, "ORIGIN_DENIED");
  }
  if (read && ["same-origin", "none"].includes(request.headers.get("sec-fetch-site") ?? "")) return;
  throw new RouteError(403, "ORIGIN_REQUIRED");
}
async function boundedJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new RouteError(415, "JSON_CONTENT_TYPE_REQUIRED");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/u.test(length) || Number(length) > 12_000)) throw new RouteError(413, "REQUEST_TOO_LARGE");
  try { const text = await request.text(); if (Buffer.byteLength(text, "utf8") > 12_000) throw new Error(); return JSON.parse(text) as unknown; }
  catch { throw new RouteError(400, "INVALID_INPUT"); }
}
function routeError(error: unknown): Response {
  if (error instanceof MerchantIdentityError) return Response.json({ error: error.code }, { status: error.code === "UNAUTHENTICATED" ? 401 : 403, headers: noStore });
  if (error instanceof HandoffServiceError) {
    const status = error.code === "MEMBERSHIP_REQUIRED" ? 403
      : error.code === "CONVERSATION_NOT_FOUND" ? 404
        : error.code === "INVALID_INPUT" ? 400 : 409;
    return Response.json({ error: error.code }, { status, headers: noStore });
  }
  if (error instanceof RouteError) return Response.json({ error: error.code }, { status: error.status, headers: noStore });
  process.stderr.write(`${JSON.stringify({ level: "error", event: "handoff_api.request_failed", name: error instanceof Error ? error.name : "UnknownError" })}\n`);
  return Response.json({ error: "REQUEST_FAILED" }, { status: 500, headers: noStore });
}

/** Next route adapters are intentionally thin; all query and policy work stays in composition. */
export function createHandoffRoutes(requireHost: () => Promise<HandoffHost>) {
  const host = async () => requireHost();
  const conversation = (value: string) => {
    if (!conversationIdPattern.test(value)) throw new RouteError(404, "CONVERSATION_NOT_FOUND");
    return value;
  };
  return Object.freeze({
    async list(request: Request) {
      try { assertOrigin(request, true); const { identity, service } = await host(); return Response.json({ data: await service.list(identity.workspace, identity.userId) }, { headers: noStore }); }
      catch (error) { return routeError(error); }
    },
    async messages(request: Request, context: { params: Promise<{ conversationId: string }> }) {
      try { assertOrigin(request, true); const { conversationId } = await context.params; const { identity, service } = await host(); return Response.json({ data: await service.messages(identity.workspace, identity.userId, conversation(conversationId)) }, { headers: noStore }); }
      catch (error) { return routeError(error); }
    },
    async claim(request: Request, context: { params: Promise<{ conversationId: string }> }) {
      try { assertOrigin(request); const { conversationId } = await context.params; const { identity, service } = await host(); return Response.json({ data: await service.claim(identity.workspace, identity.userId, conversation(conversationId)) }, { headers: noStore }); }
      catch (error) { return routeError(error); }
    },
    async reply(request: Request, context: { params: Promise<{ conversationId: string }> }) {
      try {
        assertOrigin(request); const { conversationId } = await context.params; const { identity, service } = await host();
        const body = await boundedJson(request);
        if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).sort().join(",") !== "deliveryId,text") throw new RouteError(400, "INVALID_INPUT");
        const { text, deliveryId } = body as { text?: unknown; deliveryId?: unknown };
        if (typeof text !== "string" || typeof deliveryId !== "string") throw new RouteError(400, "INVALID_INPUT");
        const result = await service.reply(identity.workspace, identity.userId, conversation(conversationId), text, deliveryId);
        return Response.json({ data: result }, { headers: noStore });
      } catch (error) { return routeError(error); }
    },
    async release(request: Request, context: { params: Promise<{ conversationId: string }> }) {
      try { assertOrigin(request); const { conversationId } = await context.params; const { identity, service } = await host(); return Response.json({ data: await service.release(identity.workspace, identity.userId, conversation(conversationId)) }, { headers: noStore }); }
      catch (error) { return routeError(error); }
    },
  });
}
