import type { TrustedWorkspaceContext } from "../tenancy/index.js";

export type KnowledgeSourceKind = "faq" | "pdf" | "csv";
export type KnowledgeSourceStatus = "active" | "archived";
export type KnowledgeVersionStatus =
  | "uploaded"
  | "validating"
  | "extracting"
  | "indexed"
  | "approved"
  | "quarantined"
  | "failed"
  | "revoked";

export type KnowledgeSource = Readonly<{
  workspaceId: string;
  sourceId: string;
  kind: KnowledgeSourceKind;
  title: string;
  status: KnowledgeSourceStatus;
  createdAt: string;
}>;

export type KnowledgeChunk = Readonly<{
  workspaceId: string;
  sourceId: string;
  versionId: string;
  chunkId: string;
  chunkIndex: number;
  text: string;
  locator: KnowledgeCitationLocator;
  /** UTF-16 code-unit offsets into the exact immutable version.content string. */
  start: number;
  end: number;
}>;

export type KnowledgeVersion = Readonly<{
  workspaceId: string;
  sourceId: string;
  versionId: string;
  kind: KnowledgeSourceKind;
  title: string;
  content: string;
  status: KnowledgeVersionStatus;
  chunks: readonly KnowledgeChunk[];
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  revokedAt?: string;
  revokedBy?: string;
  revocationReason?: string;
}>;

export type KnowledgeVersionDraft = Omit<KnowledgeVersion,
  "status" | "approvedAt" | "approvedBy" | "revokedAt" | "revokedBy" | "revocationReason">;
export type KnowledgeVersionTransition = "validating" | "extracting" | "indexed" | "quarantined" | "failed";

export type KnowledgeCitationLocator = Readonly<{
  kind: "span";
  chunkIndex: number;
  start: number;
  end: number;
}> | Readonly<{ kind: "page"; page: number; chunkIndex?: number }>
  | Readonly<{ kind: "row"; row: number; chunkIndex?: number }>
  | Readonly<{ kind: "chunk"; chunkIndex: number }>;

export type KnowledgeCitation = Readonly<{
  workspaceId: string;
  sourceId: string;
  sourceVersionId: string;
  chunkId: string;
  locator: KnowledgeCitationLocator;
}>;

export type KnowledgeExtractedSegment = Readonly<{
  text: string;
  locator: Readonly<{ kind: "page"; page: number } | { kind: "row"; row: number }>;
}>;

export type KnowledgeExtractionFailureCode =
  | "UNSUPPORTED_FORMAT"
  | "FILE_TOO_LARGE"
  | "MALFORMED_FILE"
  | "INVALID_ENCODING"
  | "NO_TEXT_CONTENT"
  | "TOO_MANY_PAGES"
  | "TOO_MANY_ROWS"
  | "TOO_MANY_COLUMNS"
  | "RECORD_TOO_LARGE"
  | "OUTPUT_TOO_LARGE"
  | "PROCESSING_LIMIT";

export type KnowledgeDocumentExtractionResult =
  | Readonly<{ kind: "success"; segments: readonly KnowledgeExtractedSegment[] }>
  | Readonly<{ kind: "failure"; code: KnowledgeExtractionFailureCode }>;

/** Parsing adapters receive bounded bytes and return source-addressable text, never tenant identity. */
export interface KnowledgeDocumentExtractorPort {
  extract(input: Readonly<{ kind: "pdf" | "csv"; bytes: Uint8Array }>): Promise<KnowledgeDocumentExtractionResult>;
}

export type KnowledgeRetrievalQuery = Readonly<{
  /** Resolved by the authenticated server boundary; never accepted from chat text. */
  workspace: TrustedWorkspaceContext;
  query: string;
  limit: number;
}>;

export type KnowledgeRetrievalHit = Readonly<{
  sourceId: string;
  versionId: string;
  title: string;
  text: string;
  score: number;
  citation: KnowledgeCitation;
}>;

export type KnowledgeRetrievalResult =
  | Readonly<{ kind: "evidence"; hits: readonly KnowledgeRetrievalHit[] }>
  | Readonly<{ kind: "no_answer"; reason: "NO_APPROVED_EVIDENCE" }>;

/**
 * Every method is scoped by server-resolved workspace context. Adapters must
 * enforce the same scope at their storage boundary, not trust row fields.
 */
export type Awaitable<T> = T | Promise<T>;

export interface KnowledgeRepositoryPort {
  createSource(
    workspace: TrustedWorkspaceContext,
    input: Readonly<{ sourceId: string; title: string; kind: KnowledgeSourceKind }>,
  ): Awaitable<KnowledgeSource>;
  getSource(workspace: TrustedWorkspaceContext, sourceId: string): Awaitable<KnowledgeSource | null>;
  archiveSource(workspace: TrustedWorkspaceContext, sourceId: string): Awaitable<KnowledgeSource>;
  /** Persist only an uploaded draft and reject conflicting source/version IDs. */
  createVersion(workspace: TrustedWorkspaceContext, version: KnowledgeVersionDraft): Awaitable<KnowledgeVersion>;
  getVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string): Awaitable<KnowledgeVersion | null>;
  transitionVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, next: KnowledgeVersionTransition): Awaitable<KnowledgeVersion>;
  /** Approval must be atomic and preserve at most one approved/current version per source. */
  approveVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, input: Readonly<{ approvedBy: string; approvedAt?: string }>): Awaitable<KnowledgeVersion>;
  revokeVersion(workspace: TrustedWorkspaceContext, sourceId: string, versionId: string, input: Readonly<{ revokedBy: string; reason: string; revokedAt?: string }>): Awaitable<KnowledgeVersion>;
  listRetrievableChunks(workspace: TrustedWorkspaceContext): Awaitable<readonly Readonly<{
    source: KnowledgeSource;
    version: KnowledgeVersion;
    chunk: KnowledgeChunk;
  }>[]>;
}

export interface KnowledgeRetrievalPort {
  search(query: KnowledgeRetrievalQuery): Promise<KnowledgeRetrievalResult>;
}
