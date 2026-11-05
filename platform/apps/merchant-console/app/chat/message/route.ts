import { webChatMessage } from "../../../lib/web-chat-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return webChatMessage(request);
}
