import type { TrustedWorkspaceContext } from "../../contracts/tenancy/index.js";
import type {
  KnowledgeChunk,
  KnowledgeCitation,
  KnowledgeRetrievalHit,
  KnowledgeRetrievalPort,
  KnowledgeRetrievalQuery,
  KnowledgeRetrievalResult,
  KnowledgeRepositoryPort,
  KnowledgeSource,
  KnowledgeVersion,
  KnowledgeVersionTransition,
  KnowledgeVersionStatus,
} from "../../contracts/data/knowledge.js";

export * from "../../contracts/data/knowledge.js";

export type KnowledgeErrorCode =
  | "INVALID_KNOWLEDGE_INPUT"
  | "SOURCE_NOT_FOUND"
  | "SOURCE_CONFLICT"
  | "SOURCE_ARCHIVED"
  | "APPROVED_VERSION_EXISTS"
  | "VERSION_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_VERSION_TRANSITION"
  | "APPROVAL_NOT_ELIGIBLE"
  | "REVOCATION_NOT_ELIGIBLE"
  | "CROSS_WORKSPACE_ACCESS_DENIED"
  | "INVALID_RETRIEVAL_QUERY"
  | "UNTRUSTED_WORKSPACE_SELECTOR";

export class KnowledgeError extends Error {
  constructor(readonly code: KnowledgeErrorCode) {
    super(code);
    this.name = "KnowledgeError";
  }
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_CONTENT_CHARS = 20_000;
const MAX_CHUNK_CHARS = 320;
const MAX_QUERY_CHARS = 500;
const MAX_RETRIEVAL_LIMIT = 20;

function assertId(value: string): void {
  if (!idPattern.test(value)) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
}

function assertWorkspace(workspace: TrustedWorkspaceContext, workspaceId: string): void {
  if (workspace.workspaceId !== workspaceId) throw new KnowledgeError("CROSS_WORKSPACE_ACCESS_DENIED");
}

function validText(value: string, max: number): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.trim().length === 0) return false;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return false;
      i += 1;
    } else if (code >= 0xDC00 && code <= 0xDFFF) return false;
  }
  return true;
}

function splitIntoChunks(
  workspaceId: string,
  sourceId: string,
  versionId: string,
  content: string,
): readonly KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  let start = 0;
  while (start < content.length) {
    let end = Math.min(start + MAX_CHUNK_CHARS, content.length);
    if (end < content.length) {
      // Prefer a nearby whitespace boundary; otherwise use a deterministic hard cut.
      const floor = start + Math.floor(MAX_CHUNK_CHARS * 0.65);
      const boundary = content.lastIndexOf(" ", end - 1);
      const newline = content.lastIndexOf("\n", end - 1);
      const preferred = Math.max(boundary, newline);
      if (preferred >= floor) end = preferred + 1;
      // UTF-16 citation offsets may not split a surrogate pair.
      const high = content.charCodeAt(end - 1);
      const low = content.charCodeAt(end);
      if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF) end -= 1;
    }
    const index = chunks.length;
    chunks.push(Object.freeze({
      workspaceId,
      sourceId,
      versionId,
      chunkId: `${sourceId}:${versionId}:${index}`,
      chunkIndex: index,
      text: content.slice(start, end),
      start,
      end,
    }));
    start = end;
  }
  return Object.freeze(chunks);
}

export function createFaqVersion(input: Readonly<{
  workspace: TrustedWorkspaceContext;
  sourceId: string;
  versionId: string;
  title: string;
  content: string;
  createdAt?: string;
}>): KnowledgeVersion {
  assertId(input.sourceId);
  assertId(input.versionId);
  if (!validText(input.title, 200) || !validText(input.content, MAX_CONTENT_CHARS)) {
    throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  return Object.freeze({
    workspaceId: input.workspace.workspaceId,
    sourceId: input.sourceId,
    versionId: input.versionId,
    title: input.title.trim(),
    content: input.content,
    status: "uploaded",
    chunks: splitIntoChunks(input.workspace.workspaceId, input.sourceId, input.versionId, input.content),
    createdAt,
  });
}

export type VersionTransition = KnowledgeVersionTransition;

const transitions: Readonly<Record<KnowledgeVersionStatus, readonly KnowledgeVersionStatus[]>> = {
  uploaded: ["validating", "quarantined", "failed"],
  validating: ["extracting", "quarantined", "failed"],
  extracting: ["indexed", "quarantined", "failed"],
  indexed: ["quarantined", "failed"],
  approved: ["revoked"],
  quarantined: [],
  failed: ["validating"],
  revoked: [],
};

export function transitionKnowledgeVersion(version: KnowledgeVersion, next: VersionTransition): KnowledgeVersion {
  if (!transitions[version.status].includes(next)) throw new KnowledgeError("INVALID_VERSION_TRANSITION");
  return Object.freeze({ ...version, status: next });
}

export function approveKnowledgeVersion(
  version: KnowledgeVersion,
  input: Readonly<{ approvedBy: string; approvedAt?: string }>,
): KnowledgeVersion {
  if (version.status !== "indexed" || version.chunks.length === 0) throw new KnowledgeError("APPROVAL_NOT_ELIGIBLE");
  assertId(input.approvedBy);
  const approvedAt = input.approvedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(approvedAt))) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  return Object.freeze({ ...version, status: "approved", approvedBy: input.approvedBy, approvedAt });
}

export function revokeKnowledgeVersion(
  version: KnowledgeVersion,
  input: Readonly<{ revokedBy: string; reason: string; revokedAt?: string }>,
): KnowledgeVersion {
  if (version.status !== "approved") throw new KnowledgeError("REVOCATION_NOT_ELIGIBLE");
  assertId(input.revokedBy);
  if (!validText(input.reason, 500)) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  const revokedAt = input.revokedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(revokedAt))) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  return Object.freeze({ ...version, status: "revoked", revokedBy: input.revokedBy, revocationReason: input.reason, revokedAt });
}

export function archiveKnowledgeSource(source: KnowledgeSource): KnowledgeSource {
  if (source.status === "archived") return source;
  return Object.freeze({ ...source, status: "archived" });
}

const tokens = (text: string): ReadonlySet<string> => {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("th-TH");
  const result = new Set(normalized.match(/[a-z0-9]+(?:[-_./][a-z0-9]+)*|[\u0E00-\u0E7F]+/gu) ?? []);
  // Character bigrams provide a small deterministic Thai baseline without claiming a tokenizer.
  for (const run of normalized.match(/[\u0E00-\u0E7F]+/gu) ?? []) {
    const chars = Array.from(run);
    for (let i = 0; i + 1 < chars.length; i += 1) result.add(chars[i]! + chars[i + 1]!);
  }
  return result;
};

function score(queryTerms: ReadonlySet<string>, text: string): number {
  const bodyTerms = tokens(text);
  const matches = [...queryTerms].filter((term) => bodyTerms.has(term));
  if (matches.length === 0) return 0;
  const skuTerms = [...queryTerms].filter((term) => /[a-z0-9]/iu.test(term));
  const exactSku = skuTerms.length > 0 && skuTerms.some((term) => bodyTerms.has(term));
  return (exactSku ? 2 : 0) + matches.length / Math.max(queryTerms.size, 1);
}

export async function retrieveKnowledge(
  repository: KnowledgeRepositoryPort,
  query: KnowledgeRetrievalQuery,
): Promise<KnowledgeRetrievalResult> {
  const keys = Object.keys(query as object);
  if (keys.some((key) => key !== "workspace" && key !== "query" && key !== "limit")) {
    throw new KnowledgeError("UNTRUSTED_WORKSPACE_SELECTOR");
  }
  if (!validText(query.query, MAX_QUERY_CHARS) || !Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_RETRIEVAL_LIMIT) {
    throw new KnowledgeError("INVALID_RETRIEVAL_QUERY");
  }
  const queryTerms = tokens(query.query);
  const candidates: KnowledgeRetrievalHit[] = [];
  for (const item of await repository.listRetrievableChunks(query.workspace)) {
    assertWorkspace(query.workspace, item.source.workspaceId);
    assertWorkspace(query.workspace, item.version.workspaceId);
    assertWorkspace(query.workspace, item.chunk.workspaceId);
    if (item.source.status !== "active" || item.version.status !== "approved") continue;
    const rank = score(queryTerms, item.chunk.text);
    if (rank <= 0) continue;
    const citation: KnowledgeCitation = Object.freeze({
      workspaceId: item.chunk.workspaceId,
      sourceId: item.source.sourceId,
      sourceVersionId: item.version.versionId,
      chunkId: item.chunk.chunkId,
      locator: Object.freeze({ kind: "span", chunkIndex: item.chunk.chunkIndex, start: item.chunk.start, end: item.chunk.end }),
    });
    candidates.push(Object.freeze({
      sourceId: item.source.sourceId,
      versionId: item.version.versionId,
      title: item.source.title,
      text: item.chunk.text,
      score: rank,
      citation,
    }));
  }
  candidates.sort((a, b) => b.score - a.score
    || a.sourceId.localeCompare(b.sourceId)
    || a.versionId.localeCompare(b.versionId)
    || (a.citation.locator.kind === "span" ? a.citation.locator.chunkIndex : 0)
      - (b.citation.locator.kind === "span" ? b.citation.locator.chunkIndex : 0));
  const hits = Object.freeze(candidates.slice(0, query.limit));
  return hits.length > 0 ? Object.freeze({ kind: "evidence", hits }) : Object.freeze({ kind: "no_answer", reason: "NO_APPROVED_EVIDENCE" });
}

export class KnowledgeRetriever implements KnowledgeRetrievalPort {
  constructor(private readonly repository: KnowledgeRepositoryPort) {}
  search(query: KnowledgeRetrievalQuery): Promise<KnowledgeRetrievalResult> {
    return retrieveKnowledge(this.repository, query);
  }
}
