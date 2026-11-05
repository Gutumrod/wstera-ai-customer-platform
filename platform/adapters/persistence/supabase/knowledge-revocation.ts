import type { SupabaseClient } from "@supabase/supabase-js";
import { KnowledgeError, type KnowledgeErrorCode } from "../../../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";

const revocationErrors = new Set(["MEMBERSHIP_REQUIRED", "OWNER_ROLE_REQUIRED", "SOURCE_NOT_FOUND", "VERSION_NOT_FOUND", "REVOCATION_NOT_ELIGIBLE", "INVALID_KNOWLEDGE_INPUT"]);

/** Owner-only revocation and archiving; the database takes the actor from auth.uid(). Declared here, not in the shared contract. */
export interface KnowledgeRevocationPort {
  revokeVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, reason: string): Promise<void>;
  archiveSource(workspace: TrustedWorkspaceContext, sourceId: string): Promise<void>;
}

/**
 * Revokes and archives as the signed-in user through the verified Auth client. The direct-Postgres runtime
 * role cannot do either (migration 20261103000200).
 */
export class SupabaseKnowledgeRevocation implements KnowledgeRevocationPort {
  constructor(private readonly client: SupabaseClient) {}

  async revokeVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, reason: string): Promise<void> {
    await this.call("revoke_knowledge_version", {
      target_workspace_id: workspace.workspaceId,
      target_source_id: sourceId,
      target_version_id: versionId,
      reason,
    });
  }

  async archiveSource(workspace: TrustedWorkspaceContext, sourceId: string): Promise<void> {
    await this.call("archive_knowledge_source", { target_workspace_id: workspace.workspaceId, target_source_id: sourceId });
  }

  private async call(name: string, args: Record<string, string>): Promise<void> {
    const { error } = await this.client.schema("aicp").rpc(name, args);
    if (!error) return;
    if (error.code === "AC001" && revocationErrors.has(error.message)) throw new KnowledgeError(error.message as KnowledgeErrorCode);
    throw new Error("KNOWLEDGE_REVOCATION_FAILED");
  }
}
