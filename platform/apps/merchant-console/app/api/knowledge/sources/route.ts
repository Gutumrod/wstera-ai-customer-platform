import { requireKnowledgeHost } from "@/lib/host.js";
import { createKnowledgeRoutes } from "@/lib/knowledge-routes.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const routes = createKnowledgeRoutes(requireKnowledgeHost);
export const GET = routes.listSources;
export const POST = routes.createSource;
