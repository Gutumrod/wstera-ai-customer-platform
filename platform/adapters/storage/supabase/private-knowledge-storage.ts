import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";
import type { KnowledgeObjectIdentity, KnowledgeObjectStoragePort } from "../../../contracts/data/knowledge-storage.js";
export type { KnowledgeObjectIdentity, KnowledgeObjectStoragePort } from "../../../contracts/data/knowledge-storage.js";

const bucketName = "knowledge-originals";
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

/** One rule for upload and delete: exactly workspace/source/version/filename, inside this workspace. */
function isWorkspaceObjectPath(workspace: TrustedWorkspaceContext, path: string): boolean {
  const parts = path.split("/");
  return parts.length === 4 && parts[0] === workspace.workspaceId && idPattern.test(workspace.workspaceId)
    && idPattern.test(parts[1] ?? "") && idPattern.test(parts[2] ?? "")
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(parts[3] ?? "");
}

/** Server-only Supabase admin client; callers must authorize workspace identity before storage access. */
export class SupabasePrivateKnowledgeStorage implements KnowledgeObjectStoragePort {
  constructor(private readonly client: SupabaseClient) {}

  async putOriginal(
    workspace: TrustedWorkspaceContext,
    identity: KnowledgeObjectIdentity,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<Readonly<{ path: string; created: boolean }>> {
    const path = `${workspace.workspaceId}/${identity.sourceId}/${identity.versionId}/${identity.filename}`;
    if (!isWorkspaceObjectPath(workspace, path)) throw new Error("INVALID_KNOWLEDGE_OBJECT_PATH");
    const { error } = await this.client.storage.from(bucketName).upload(path, bytes, {
      contentType,
      cacheControl: "0",
      upsert: false,
    });
    if (!error) return Object.freeze({ path, created: true });

    // An idempotent retry may encounter its own immutable object. Verify exact bytes before reuse.
    const { data, error: readError } = await this.client.storage.from(bucketName).download(path);
    if (readError || !data) throw new Error("KNOWLEDGE_OBJECT_UPLOAD_FAILED");
    const existing = new Uint8Array(await data.arrayBuffer());
    if (existing.byteLength !== bytes.byteLength || existing.some((value, index) => value !== bytes[index])) {
      throw new Error("KNOWLEDGE_OBJECT_CONFLICT");
    }
    return Object.freeze({ path, created: false });
  }

  async removeOriginal(workspace: TrustedWorkspaceContext, path: string): Promise<void> {
    if (!isWorkspaceObjectPath(workspace, path)) throw new Error("CROSS_WORKSPACE_OBJECT_DELETE_DENIED");
    const { error } = await this.client.storage.from(bucketName).remove([path]);
    if (error) throw new Error("KNOWLEDGE_OBJECT_DELETE_FAILED");
  }
}
