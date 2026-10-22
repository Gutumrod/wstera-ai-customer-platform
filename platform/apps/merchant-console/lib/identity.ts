import type { SupabaseClient } from "@supabase/supabase-js";
import { MerchantIdentityError, resolveMerchantIdentity, type MerchantIdentity } from "../../../modules/tenancy/merchant-identity.js";
import { SupabaseWorkspaceMembershipRepository } from "../../../adapters/persistence/supabase/workspace-membership-repository.js";
export { MerchantIdentityError };

export async function requireMerchantIdentity(): Promise<Readonly<{
  client: SupabaseClient;
  identity: MerchantIdentity;
}>> {
  const { createSupabaseServerClient } = await import("./supabase/server.js");
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string" || userId.length === 0) throw new MerchantIdentityError("UNAUTHENTICATED");
  return { client, identity: await resolveMerchantIdentity(new SupabaseWorkspaceMembershipRepository(client), userId) };
}
