import type { TrustedWorkspaceContext } from "../tenancy/index.js";

export type KnowledgeQuarantineRecord = Readonly<{
  workspaceId: string;
  attemptId: string;
  idempotencyKey: string;
  requestHash: string;
  kind: "pdf" | "csv";
  title: string;
  filename?: string;
  contentType?: string;
  byteSize: number;
  objectPath?: string;
  failureCode: string;
  createdAt: string;
}>;

export interface KnowledgeIntakeAuditPort {
  recordOriginal(
    workspace: TrustedWorkspaceContext,
    input: Readonly<{
      sourceId: string;
      versionId: string;
      objectPath: string;
      filename: string;
      contentType: string;
      byteSize: number;
    }>,
  ): Promise<void>;
  quarantine(
    workspace: TrustedWorkspaceContext,
    input: Omit<KnowledgeQuarantineRecord, "workspaceId" | "createdAt">,
  ): Promise<KnowledgeQuarantineRecord>;
  listQuarantine(workspace: TrustedWorkspaceContext): Promise<readonly KnowledgeQuarantineRecord[]>;
}
