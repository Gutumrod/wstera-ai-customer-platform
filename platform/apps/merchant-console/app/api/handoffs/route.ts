import { requireHandoffRoutes } from "@/lib/handoff-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return (await requireHandoffRoutes()).list(request); }
