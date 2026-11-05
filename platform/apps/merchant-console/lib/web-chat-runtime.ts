import "server-only";
import { createWebChatRoutes } from "../../../composition/web-chat-routes.js";
import { createWebChatRealHost } from "../../../composition/web-chat-real-host.js";
import { inspectSessionCookie } from "../../../composition/web-chat-session.js";

type RuntimeGlobal = typeof globalThis & { __webChatRoutes?: Promise<ReturnType<typeof createWebChatRoutes>> };

function serviceUnavailable(): Response {
  return new Response(JSON.stringify({ error: "SERVICE_UNAVAILABLE" }), {
    status: 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function configuredRoutes(): Promise<ReturnType<typeof createWebChatRoutes>> | null {
  const secret = process.env.WEB_CHAT_SESSION_SECRET;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) return null;
  const shared = globalThis as RuntimeGlobal;
  if (!shared.__webChatRoutes) {
    const trustedIpHeader = process.env.WEB_CHAT_TRUSTED_IP_HEADER;
    if (trustedIpHeader && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(trustedIpHeader)) return null;
    const pending = createWebChatRealHost().then((host) => createWebChatRoutes({
      messageEndpoint: "/chat/message",
      resolveConnection: host.resolveConnection,
      allowedOrigins: host.allowedOrigins,
      sessionSecret: secret,
      responder: host.responder,
      requestHandoff: host.requestHandoff,
      persistTurn: host.persistTurn,
      staffUpdates: host.staffUpdates,
      describeCitation: host.describeCitation,
      secureCookie: process.env.APP_ENV !== "local",
      clientKey(request) {
        if (trustedIpHeader) {
          const address = request.headers.get(trustedIpHeader)?.trim();
          if (address && address.length <= 128) return `ip:${address}`;
        }
        // ponytail: without an explicitly trusted proxy header, all visitors to one connection share a rate-limit bucket.
        const session = inspectSessionCookie(request.headers.get("cookie"), secret);
        if (session) return `connection:${session.connectionId}`;
        try {
          const connectionId = new URL(request.url).searchParams.get("c");
          return `connection:${connectionId || "shared"}`;
        } catch {
          return "connection:shared";
        }
      },
    }));
    // A failed init (e.g. transient DB outage) must not be cached forever; the next request retries.
    pending.catch(() => { if (shared.__webChatRoutes === pending) delete shared.__webChatRoutes; });
    shared.__webChatRoutes = pending;
  }
  return shared.__webChatRoutes;
}

export async function webChatPage(request: Request): Promise<Response> {
  let routes: ReturnType<typeof configuredRoutes>;
  try { routes = configuredRoutes(); } catch { return serviceUnavailable(); }
  if (!routes) return serviceUnavailable();
  try { return await (await routes).page(request); } catch { return serviceUnavailable(); }
}

export async function webChatMessage(request: Request): Promise<Response> {
  let routes: ReturnType<typeof configuredRoutes>;
  try { routes = configuredRoutes(); } catch { return serviceUnavailable(); }
  if (!routes) return serviceUnavailable();
  try { return await (await routes).message(request); } catch { return serviceUnavailable(); }
}

export async function webChatUpdates(request: Request): Promise<Response> {
  let routes: ReturnType<typeof configuredRoutes>;
  try { routes = configuredRoutes(); } catch { return serviceUnavailable(); }
  if (!routes) return serviceUnavailable();
  try { return await (await routes).updates(request); } catch { return serviceUnavailable(); }
}
