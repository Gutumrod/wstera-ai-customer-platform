import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveMerchantBinding, MerchantMembershipRepositoryPort, MerchantRole } from "../../../contracts/tenancy/merchant.js";

/** Uses a verified request-scoped Auth client; RLS limits membership rows to auth.uid(). */
export class SupabaseWorkspaceMembershipRepository implements MerchantMembershipRepositoryPort {
  constructor(private readonly client: SupabaseClient) {}

  async listActiveBindings(userId: string): Promise<readonly ActiveMerchantBinding[]> {
    const schema = this.client.schema("aicp");
    const membershipsResponse = await schema.from("workspace_memberships")
      .select("workspace_id, role, workspaces!inner(status)")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("workspaces.status", "active");
    if (membershipsResponse.error) throw new Error("MEMBERSHIP_LOOKUP_FAILED");
    const memberships = membershipsResponse.data as unknown as Array<{ workspace_id: string; role: MerchantRole }> | null;
    const bindings: ActiveMerchantBinding[] = [];
    for (const membership of memberships ?? []) {
      const connectionsResponse = await schema.from("workspace_connections")
        .select("connection_id, channel")
        .eq("workspace_id", membership.workspace_id)
        .eq("channel", "web")
        .eq("status", "active");
      if (connectionsResponse.error) throw new Error("WEB_CONNECTION_LOOKUP_FAILED");
      const connections = connectionsResponse.data as unknown as Array<{ connection_id: string; channel: "web" }> | null;
      for (const connection of connections ?? []) bindings.push(Object.freeze({
        workspaceId: membership.workspace_id,
        role: membership.role,
        connectionId: connection.connection_id,
        channel: connection.channel,
      }));
    }
    return Object.freeze(bindings);
  }
}
