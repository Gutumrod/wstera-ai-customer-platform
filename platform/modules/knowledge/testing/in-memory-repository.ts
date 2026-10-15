import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";
import type {
  KnowledgeCitationLocator,
  KnowledgeExtractedSegment,
  KnowledgeSource,
  KnowledgeVersion,
  KnowledgeVersionDraft,
  KnowledgeVersionTransition,
} from "../../../contracts/data/knowledge.js";
import type { KnowledgeRepositoryPort } from "../../../contracts/data/knowledge.js";
import {
  KnowledgeError,
  archiveKnowledgeSource,
  approveKnowledgeVersion,
  createFaqVersion,
  createImportedKnowledgeVersion,
  revokeKnowledgeVersion,
  transitionKnowledgeVersion,
} from "../index.js";

const key = (workspaceId: string, sourceId: string): string => `${workspaceId}\u0000${sourceId}`;
const versionKey = (workspaceId: string, sourceId: string, versionId: string): string => `${key(workspaceId, sourceId)}\u0000${versionId}`;

function assertScope(workspace: TrustedWorkspaceContext, value: { workspaceId: string }): void {
  if (workspace.workspaceId !== value.workspaceId) throw new KnowledgeError("CROSS_WORKSPACE_ACCESS_DENIED");
}

function sameLocator(left: KnowledgeCitationLocator, right: KnowledgeCitationLocator): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "span" && right.kind === "span") {
    return left.chunkIndex === right.chunkIndex && left.start === right.start && left.end === right.end;
  }
  if (left.kind === "page" && right.kind === "page") {
    return left.page === right.page && left.chunkIndex === right.chunkIndex;
  }
  if (left.kind === "row" && right.kind === "row") {
    return left.row === right.row && left.chunkIndex === right.chunkIndex;
  }
  if (left.kind === "chunk" && right.kind === "chunk") return left.chunkIndex === right.chunkIndex;
  return false;
}

function canonicalizeImportedVersion(workspace: TrustedWorkspaceContext, version: KnowledgeVersionDraft): KnowledgeVersion {
  const segments: KnowledgeExtractedSegment[] = [];
  let current: { locator: KnowledgeExtractedSegment["locator"]; text: string; nextChunkIndex: number } | undefined;
  for (const chunk of version.chunks) {
    const locator = chunk.locator;
    if (locator.kind !== "page" && locator.kind !== "row") {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    const position = locator.kind === "page" ? locator.page : locator.row;
    if (!Number.isSafeInteger(position) || position < 1) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    if (!current || locator.chunkIndex === 0) {
      if (current) segments.push(current);
      if (locator.chunkIndex !== 0) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
      current = {
        locator: locator.kind === "page" ? { kind: "page", page: locator.page } : { kind: "row", row: locator.row },
        text: "",
        nextChunkIndex: 0,
      };
    }
    const currentPosition = current.locator.kind === "page" ? current.locator.page : current.locator.row;
    if (locator.kind !== current.locator.kind || position !== currentPosition || locator.chunkIndex !== current.nextChunkIndex) {
      throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    }
    current.text += chunk.text;
    current.nextChunkIndex += 1;
  }
  if (current) segments.push(current);
  const firstLocator = version.chunks[0]?.locator;
  return createImportedKnowledgeVersion({
    workspace,
    sourceId: version.sourceId,
    versionId: version.versionId,
    title: version.title,
    kind: firstLocator?.kind === "row" ? "csv" : "pdf",
    segments,
    createdAt: version.createdAt,
  });
}

export class InMemoryKnowledgeRepository implements KnowledgeRepositoryPort {
  private readonly sources = new Map<string, KnowledgeSource>();
  private readonly versions = new Map<string, KnowledgeVersion>();

  createSource(
    workspace: TrustedWorkspaceContext,
    input: Readonly<{ sourceId: string; title: string; kind: KnowledgeSource["kind"] }>,
  ): KnowledgeSource {
    if (Object.keys(input as object).some((field) => !["sourceId", "title", "kind"].includes(field))) {
      throw new KnowledgeError("CROSS_WORKSPACE_ACCESS_DENIED");
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.sourceId)
      || typeof input.title !== "string" || input.title.trim().length === 0 || input.title.length > 200
      || !["faq", "pdf", "csv"].includes(input.kind)) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    const source = Object.freeze({
      workspaceId: workspace.workspaceId,
      sourceId: input.sourceId,
      title: input.title,
      kind: input.kind,
      status: "active" as const,
      createdAt: new Date().toISOString(),
    });
    const id = key(workspace.workspaceId, input.sourceId);
    const existing = this.sources.get(id);
    if (existing && (existing.title !== source.title || existing.kind !== source.kind)) throw new KnowledgeError("SOURCE_CONFLICT");
    if (!existing) this.sources.set(id, source);
    return existing ?? source;
  }

  getSource(workspace: TrustedWorkspaceContext, sourceId: string): KnowledgeSource | null {
    return this.sources.get(key(workspace.workspaceId, sourceId)) ?? null;
  }

  createVersion(workspace: TrustedWorkspaceContext, version: KnowledgeVersionDraft): KnowledgeVersion {
    assertScope(workspace, version);
    const source = this.getSource(workspace, version.sourceId);
    if (!source) throw new KnowledgeError("SOURCE_NOT_FOUND");
    if (source.status !== "active") throw new KnowledgeError("SOURCE_ARCHIVED");
    const runtimeVersion = version as KnowledgeVersion;
    if ((runtimeVersion.status !== undefined && runtimeVersion.status !== "uploaded")
      || runtimeVersion.approvedAt !== undefined || runtimeVersion.approvedBy !== undefined
      || runtimeVersion.revokedAt !== undefined || runtimeVersion.revokedBy !== undefined
      || runtimeVersion.revocationReason !== undefined) {
      throw new KnowledgeError("INVALID_VERSION_TRANSITION");
    }
    const canonical = source.kind === "faq"
      ? createFaqVersion({
        workspace, sourceId: version.sourceId, versionId: version.versionId,
        title: version.title, content: version.content, createdAt: version.createdAt,
      })
      : canonicalizeImportedVersion(workspace, version);
    if (version.chunks.length !== canonical.chunks.length
      || version.content !== canonical.content
      || version.chunks.some((chunk, index) => {
        const expected = canonical.chunks[index]!;
        return chunk.workspaceId !== expected.workspaceId || chunk.sourceId !== expected.sourceId
          || chunk.versionId !== expected.versionId || chunk.chunkId !== expected.chunkId
          || chunk.chunkIndex !== expected.chunkIndex || chunk.text !== expected.text
          || chunk.start !== expected.start || chunk.end !== expected.end
          || !sameLocator(chunk.locator, expected.locator);
      })) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
    const id = versionKey(workspace.workspaceId, version.sourceId, version.versionId);
    const draft = Object.freeze({ ...canonical, status: "uploaded" as const }) as KnowledgeVersion;
    const existing = this.versions.get(id);
    if (existing) {
      if (existing.content !== version.content || existing.title !== version.title
        || existing.chunks.length !== version.chunks.length
        || existing.chunks.some((chunk, index) => {
          const candidate = version.chunks[index];
          return !candidate || chunk.chunkId !== candidate.chunkId || chunk.text !== candidate.text
            || chunk.start !== candidate.start || chunk.end !== candidate.end
            || !sameLocator(chunk.locator, candidate.locator);
        })) {
        throw new KnowledgeError("VERSION_CONFLICT");
      }
      return existing;
    }
    this.versions.set(id, draft);
    return draft;
  }

  getVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string): KnowledgeVersion | null {
    return this.versions.get(versionKey(workspace.workspaceId, sourceId, versionId)) ?? null;
  }

  archiveSource(workspace: TrustedWorkspaceContext, sourceId: string): KnowledgeSource {
    const id = key(workspace.workspaceId, sourceId);
    const source = this.sources.get(id);
    if (!source) throw new KnowledgeError("SOURCE_NOT_FOUND");
    const archived = archiveKnowledgeSource(source);
    this.sources.set(id, archived);
    return archived;
  }

  transitionVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, next: KnowledgeVersionTransition): KnowledgeVersion {
    return this.replaceVersion(workspace, sourceId, versionId, (version) => transitionKnowledgeVersion(version, next));
  }

  approveVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, input: { approvedBy: string; approvedAt?: string }): KnowledgeVersion {
    for (const candidate of this.versions.values()) {
      if (candidate.workspaceId === workspace.workspaceId && candidate.sourceId === sourceId
        && candidate.versionId !== versionId && candidate.status === "approved") {
        throw new KnowledgeError("APPROVED_VERSION_EXISTS");
      }
    }
    return this.replaceVersion(workspace, sourceId, versionId, (version) => approveKnowledgeVersion(version, input));
  }

  revokeVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, input: { revokedBy: string; reason: string; revokedAt?: string }): KnowledgeVersion {
    return this.replaceVersion(workspace, sourceId, versionId, (version) => revokeKnowledgeVersion(version, input));
  }

  replaceVersionContent(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, content: string): never {
    const version = this.getVersion(workspace, sourceId, versionId);
    if (!version) throw new KnowledgeError("VERSION_NOT_FOUND");
    if (version.status === "approved" || version.status === "revoked") throw new Error("APPROVED_VERSION_IMMUTABLE");
    throw new Error("CREATE_A_NEW_VERSION_INSTEAD");
  }

  listRetrievableChunks(workspace: TrustedWorkspaceContext) {
    const rows: { source: KnowledgeSource; version: KnowledgeVersion; chunk: KnowledgeVersion["chunks"][number] }[] = [];
    for (const source of this.sources.values()) {
      if (source.workspaceId !== workspace.workspaceId) continue;
      for (const version of this.versions.values()) {
        if (version.workspaceId !== workspace.workspaceId || version.sourceId !== source.sourceId) continue;
        if (source.status !== "active" || version.status !== "approved") continue;
        for (const chunk of version.chunks) rows.push(Object.freeze({ source, version, chunk }));
      }
    }
    return Object.freeze(rows);
  }

  private replaceVersion(
    workspace: TrustedWorkspaceContext,
    sourceId: string,
    versionId: string,
    update: (version: KnowledgeVersion) => KnowledgeVersion,
  ): KnowledgeVersion {
    const id = versionKey(workspace.workspaceId, sourceId, versionId);
    const version = this.versions.get(id);
    if (!version) throw new KnowledgeError("VERSION_NOT_FOUND");
    const next = update(version);
    this.versions.set(id, next);
    return next;
  }
}
