import { webChatUpdates } from "@/lib/web-chat-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return webChatUpdates(request); }
