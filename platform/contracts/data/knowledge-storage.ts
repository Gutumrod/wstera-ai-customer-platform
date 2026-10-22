import type { TrustedWorkspaceContext } from "../tenancy/index.js";

export type KnowledgeObjectIdentity = Readonly<{
  sourceId: string;
  versionId: string;
  filename: string;
}>;

export interface KnowledgeObjectStoragePort {
  putOriginal(
    workspace: TrustedWorkspaceContext,
    identity: KnowledgeObjectIdentity,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<Readonly<{ path: string; created: boolean }>>;
  removeOriginal(workspace: TrustedWorkspaceContext, objectPath: string): Promise<void>;
}
