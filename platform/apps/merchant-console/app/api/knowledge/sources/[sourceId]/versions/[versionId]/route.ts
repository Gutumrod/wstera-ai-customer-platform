import { createKnowledgeRoutes } from "../../../../../../../lib/knowledge-routes.js";
import { requireKnowledgeHost } from "../../../../../../../lib/host.js";

export const GET = createKnowledgeRoutes(requireKnowledgeHost).getVersion;
