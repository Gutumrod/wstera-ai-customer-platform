import type { SupabaseClient } from "@supabase/supabase-js";
import { KnowledgeError, type KnowledgeApprovalPort, type KnowledgeErrorCode } from "../../../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";

const approvalErrors = new Set(["MEMBERSHIP_REQUIRED", "OWNER_ROLE_REQUIRED", "SOURCE_NOT_FOUND", "VERSION_NOT_FOUND", "APPROVAL_NOT_ELIGIBLE", "APPROVED_VERSION_EXISTS"]);

/**
 * Approves as the signed-in user through the verified Auth client, so the database takes the approver
 * from auth.uid(). The direct-Postgres runtime role has no way to approve (migration 20261103000100).
 */
export class SupabaseKnowledgeApproval implements KnowledgeApprovalPort {
  constructor(private readonly client: SupabaseClient) {}

  async approve(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string): Promise<void> {
    const { error } = await this.client.schema("aicp").rpc("approve_knowledge_version", {
      target_workspace_id: workspace.workspaceId,
      target_source_id: sourceId,
      target_version_id: versionId,
    });
    if (!error) return;
    if (error.code === "AC001" && approvalErrors.has(error.message)) throw new KnowledgeError(error.message as KnowledgeErrorCode);
    throw new Error("KNOWLEDGE_APPROVAL_FAILED");
  }
}
