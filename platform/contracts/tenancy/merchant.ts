export type MerchantRole = "owner" | "staff";
export type MerchantConnectionChannel = "web" | "line";

export type ActiveMerchantBinding = Readonly<{
  workspaceId: string;
  role: MerchantRole;
  connectionId: string;
  channel: MerchantConnectionChannel;
}>;

/** Host adapter must derive bindings from a verified user subject and enforce membership RLS. */
export interface MerchantMembershipRepositoryPort {
  listActiveBindings(userId: string): Promise<readonly ActiveMerchantBinding[]>;
}
