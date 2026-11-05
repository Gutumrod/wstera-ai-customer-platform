import { requireHandoffRoutes } from "@/lib/handoff-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ conversationId: string }> }) { return (await requireHandoffRoutes()).messages(request, context); }
