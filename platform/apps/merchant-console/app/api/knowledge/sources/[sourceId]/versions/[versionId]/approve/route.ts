import { requireKnowledgeHost } from "@/lib/host.js";
import { createKnowledgeRoutes } from "@/lib/knowledge-routes.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createKnowledgeRoutes(requireKnowledgeHost).approveVersion;
