import { webChatPage } from "../../lib/web-chat-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return webChatPage(request);
}

export function HEAD(request: Request): Promise<Response> {
  return webChatPage(request);
}
