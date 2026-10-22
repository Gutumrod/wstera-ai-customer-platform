import type { TrustedWorkspaceContext } from "../../contracts/tenancy/index.js";
import type { MerchantMembershipRepositoryPort, MerchantRole } from "../../contracts/tenancy/merchant.js";
import { createTrustedWorkspace } from "./workspace.js";

export class MerchantIdentityError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "MEMBERSHIP_REQUIRED" | "WORKSPACE_AMBIGUOUS" | "WEB_CONNECTION_REQUIRED") {
    super(code);
  }
}

export type MerchantIdentity = Readonly<{
  userId: string;
  role: MerchantRole;
  workspace: TrustedWorkspaceContext;
}>;

/** Resolve exactly one workspace and one active web connection from authenticated membership data. */
export async function resolveMerchantIdentity(
  repository: MerchantMembershipRepositoryPort,
  userId: string,
): Promise<MerchantIdentity> {
  if (typeof userId !== "string" || userId.trim().length === 0 || userId.length > 128) {
    throw new MerchantIdentityError("UNAUTHENTICATED");
  }
  let bindings;
  try {
    bindings = await repository.listActiveBindings(userId);
  } catch {
    throw new MerchantIdentityError("MEMBERSHIP_REQUIRED");
  }
  const workspaceIds = new Set(bindings.map((binding) => binding.workspaceId));
  if (workspaceIds.size === 0) throw new MerchantIdentityError("MEMBERSHIP_REQUIRED");
  if (workspaceIds.size !== 1) throw new MerchantIdentityError("WORKSPACE_AMBIGUOUS");
  const workspaceId = [...workspaceIds][0]!;
  const webConnections = bindings.filter((binding) => binding.workspaceId === workspaceId && binding.channel === "web");
  if (webConnections.length === 0) throw new MerchantIdentityError("WEB_CONNECTION_REQUIRED");
  if (webConnections.length !== 1) throw new MerchantIdentityError("WORKSPACE_AMBIGUOUS");
  const binding = webConnections[0]!;
  if (binding.role !== "owner" && binding.role !== "staff") throw new MerchantIdentityError("MEMBERSHIP_REQUIRED");
  return Object.freeze({
    userId,
    role: binding.role,
    workspace: createTrustedWorkspace({
      workspaceId: binding.workspaceId,
      connectionId: binding.connectionId,
      channel: binding.channel,
    }),
  });
}
