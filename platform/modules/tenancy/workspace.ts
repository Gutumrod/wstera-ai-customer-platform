import type { TrustedWorkspaceContext } from "../../contracts/channels/index.js";

/**
 * Only a trusted host resolver may create this context. Never trust
 * x-tenant-id or an inbound message to select a workspace.
 */
export type TrustedWorkspace = TrustedWorkspaceContext;

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function createTrustedWorkspace(input: TrustedWorkspaceContext): TrustedWorkspaceContext {
  if (!idPattern.test(input.workspaceId) || !idPattern.test(input.connectionId)) {
    throw new Error("INVALID_TRUSTED_WORKSPACE");
  }
  if (input.channel !== "line" && input.channel !== "web") {
    throw new Error("INVALID_CHANNEL");
  }
  return Object.freeze({
    workspaceId: input.workspaceId,
    connectionId: input.connectionId,
    channel: input.channel,
  });
}

export function enforceWorkspace(expected: TrustedWorkspaceContext, actualWorkspaceId: string): void {
  if (expected.workspaceId !== actualWorkspaceId) {
    throw new Error("CROSS_WORKSPACE_ACCESS_DENIED");
  }
}
