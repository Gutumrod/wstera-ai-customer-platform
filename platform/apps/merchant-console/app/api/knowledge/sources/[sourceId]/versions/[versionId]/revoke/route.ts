import { createKnowledgeRoutes } from "../../../../../../../../lib/knowledge-routes.js";
import { requireKnowledgeHost } from "../../../../../../../../lib/host.js";

export const POST = createKnowledgeRoutes(requireKnowledgeHost).revokeVersion;
