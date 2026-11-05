import { SupabaseKnowledgeApproval } from "../../../adapters/persistence/supabase/knowledge-approval.js";
import { SupabaseKnowledgeRevocation } from "../../../adapters/persistence/supabase/knowledge-revocation.js";
import { createMerchantKnowledgeHost } from "../../../composition/merchant-knowledge-host.js";
import { requireMerchantIdentity } from "./identity.js";

export async function requireKnowledgeHost() {
  const { client, identity } = await requireMerchantIdentity();
  const host = await createMerchantKnowledgeHost(identity.userId);
  return { ...host, approval: new SupabaseKnowledgeApproval(client), revocation: new SupabaseKnowledgeRevocation(client), identity };
}
