import type { TrustedWorkspaceContext } from "../../contracts/tenancy/index.js";
import { KnowledgeError } from "../../contracts/data/knowledge.js";
import type {
  KnowledgeChunk,
  KnowledgeCitation,
  KnowledgeCitationLocator,
  KnowledgeDocumentExtractorPort,
  KnowledgeDocumentExtractionResult,
  KnowledgeExtractedSegment,
  KnowledgeExtractionFailureCode,
  KnowledgeRetrievalHit,
  KnowledgeRetrievalPort,
  KnowledgeRetrievalQuery,
  KnowledgeRetrievalResult,
  KnowledgeRepositoryPort,
  KnowledgeSource,
  KnowledgeVersion,
  KnowledgeVersionDraft,
  KnowledgeVersionTransition,
  KnowledgeVersionStatus,
} from "../../contracts/data/knowledge.js";

export * from "../../contracts/data/knowledge.js";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_CONTENT_CHARS = 20_000;
const MAX_IMPORTED_CONTENT_CHARS = 100_000;
const MAX_IMPORTED_SEGMENTS = 5_000;
const MAX_CHUNK_CHARS = 320;
const MAX_QUERY_CHARS = 500;
const MAX_RETRIEVAL_LIMIT = 20;
const extractionFailureCodes = new Set<KnowledgeExtractionFailureCode>([
  "UNSUPPORTED_FORMAT", "FILE_TOO_LARGE", "MALFORMED_FILE", "INVALID_ENCODING", "NO_TEXT_CONTENT",
  "TOO_MANY_PAGES", "TOO_MANY_ROWS", "TOO_MANY_COLUMNS", "RECORD_TOO_LARGE", "OUTPUT_TOO_LARGE", "PROCESSING_LIMIT",
]);

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
      locator: Object.freeze({ kind: "span", chunkIndex: index, start, end }),
      start,
      end,
    }));
    start = end;
  }
  return Object.freeze(chunks);
}

function splitExtractedSegments(
  workspaceId: string,
  sourceId: string,
  versionId: string,
  segments: readonly KnowledgeExtractedSegment[],
): Readonly<{ content: string; chunks: readonly KnowledgeChunk[] }> {
  const parts: string[] = [];
  const chunks: KnowledgeChunk[] = [];
  let contentLength = 0;

  for (const [segmentIndex, segment] of segments.entries()) {
    if (segmentIndex > 0) {
      parts.push("\n\n");
      contentLength += 2;
    }
    const locator = segment.locator;
    if (locator.kind !== "page" && locator.kind !== "row") throw new KnowledgeError("INVALID_EXTRACTION_RESULT");
    const sourcePosition = locator.kind === "page" ? locator.page : locator.row;
    if (!Number.isSafeInteger(sourcePosition) || sourcePosition < 1) throw new KnowledgeError("INVALID_EXTRACTION_RESULT");
    if (!validText(segment.text, MAX_IMPORTED_CONTENT_CHARS)) throw new KnowledgeError("INVALID_EXTRACTION_RESULT");
    if (contentLength + segment.text.length > MAX_IMPORTED_CONTENT_CHARS) throw new KnowledgeError("DOCUMENT_TOO_LARGE");

    parts.push(segment.text);
    const segmentContentStart = contentLength;
    let localStart = 0;
    let segmentChunkIndex = 0;
    while (localStart < segment.text.length) {
      let localEnd = Math.min(localStart + MAX_CHUNK_CHARS, segment.text.length);
      if (localEnd < segment.text.length) {
        const floor = localStart + Math.floor(MAX_CHUNK_CHARS * 0.65);
        const boundary = segment.text.lastIndexOf(" ", localEnd - 1);
        const newline = segment.text.lastIndexOf("\n", localEnd - 1);
        const preferred = Math.max(boundary, newline);
        if (preferred >= floor) localEnd = preferred + 1;
        const high = segment.text.charCodeAt(localEnd - 1);
        const low = segment.text.charCodeAt(localEnd);
        if (high >= 0xD800 && high <= 0xDBFF && low >= 0xDC00 && low <= 0xDFFF) localEnd -= 1;
      }
      const index = chunks.length;
      const start = segmentContentStart + localStart;
      const end = segmentContentStart + localEnd;
      const sourceLocator: KnowledgeCitationLocator = Object.freeze({ ...locator, chunkIndex: segmentChunkIndex });
      chunks.push(Object.freeze({
        workspaceId,
        sourceId,
        versionId,
        chunkId: `${sourceId}:${versionId}:${index}`,
        chunkIndex: index,
        text: segment.text.slice(localStart, localEnd),
        locator: sourceLocator,
        start,
        end,
      }));
      localStart = localEnd;
      segmentChunkIndex += 1;
    }
    contentLength += segment.text.length;
  }
  return Object.freeze({ content: parts.join(""), chunks: Object.freeze(chunks) });
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
    kind: "faq",
    title: input.title.trim(),
    content: input.content,
    status: "uploaded",
    chunks: splitIntoChunks(input.workspace.workspaceId, input.sourceId, input.versionId, input.content),
    createdAt,
  });
}

export function createImportedKnowledgeVersion(input: Readonly<{
  workspace: TrustedWorkspaceContext;
  sourceId: string;
  versionId: string;
  title: string;
  kind: "pdf" | "csv";
  segments: readonly KnowledgeExtractedSegment[];
  createdAt?: string;
}>): KnowledgeVersion {
  assertId(input.sourceId);
  assertId(input.versionId);
  if ((input.kind !== "pdf" && input.kind !== "csv")
    || !validText(input.title, 200) || !Array.isArray(input.segments) || input.segments.length === 0) {
    throw new KnowledgeError("INVALID_EXTRACTION_RESULT");
  }
  if (input.segments.length > MAX_IMPORTED_SEGMENTS) throw new KnowledgeError("DOCUMENT_TOO_LARGE");
  for (const segment of input.segments) {
    if (typeof segment !== "object" || segment === null
      || typeof segment.locator !== "object" || segment.locator === null
      || (input.kind === "pdf" && segment.locator.kind !== "page")
      || (input.kind === "csv" && segment.locator.kind !== "row")) {
      throw new KnowledgeError("INVALID_EXTRACTION_RESULT");
    }
  }
  const { content, chunks } = splitExtractedSegments(
    input.workspace.workspaceId,
    input.sourceId,
    input.versionId,
    input.segments,
  );
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  return Object.freeze({
    workspaceId: input.workspace.workspaceId,
    sourceId: input.sourceId,
    versionId: input.versionId,
    kind: input.kind,
    title: input.title.trim(),
    content,
    status: "uploaded",
    chunks,
    createdAt,
  });
}

/** Rebuild and validate a repository draft with the module's canonical chunker. */
export function canonicalizeKnowledgeVersionDraft(
  workspace: TrustedWorkspaceContext,
  version: KnowledgeVersionDraft,
): KnowledgeVersion {
  assertWorkspace(workspace, version.workspaceId);
  const canonical = version.kind === "faq"
    ? createFaqVersion({
      workspace,
      sourceId: version.sourceId,
      versionId: version.versionId,
      title: version.title,
      content: version.content,
      createdAt: version.createdAt,
    })
    : (() => {
      if (version.kind !== "pdf" && version.kind !== "csv") throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
      const segments: KnowledgeExtractedSegment[] = [];
      let current: { locator: KnowledgeExtractedSegment["locator"]; text: string; nextChunkIndex: number } | undefined;
      for (const chunk of version.chunks) {
        const locator = chunk.locator;
        if (locator.kind !== "page" && locator.kind !== "row") throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
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
      return createImportedKnowledgeVersion({
        workspace,
        sourceId: version.sourceId,
        versionId: version.versionId,
        title: version.title,
        kind: version.kind,
        segments,
        createdAt: version.createdAt,
      });
    })();

  const sameLocator = (left: KnowledgeCitationLocator, right: KnowledgeCitationLocator): boolean => {
    if (left.kind !== right.kind) return false;
    if (left.kind === "span" && right.kind === "span") {
      return left.chunkIndex === right.chunkIndex && left.start === right.start && left.end === right.end;
    }
    if (left.kind === "page" && right.kind === "page") return left.page === right.page && left.chunkIndex === right.chunkIndex;
    if (left.kind === "row" && right.kind === "row") return left.row === right.row && left.chunkIndex === right.chunkIndex;
    return left.kind === "chunk" && right.kind === "chunk" && left.chunkIndex === right.chunkIndex;
  };
  if (version.content !== canonical.content || version.chunks.length !== canonical.chunks.length
    || version.chunks.some((chunk, index) => {
      const expected = canonical.chunks[index]!;
      return chunk.workspaceId !== expected.workspaceId || chunk.sourceId !== expected.sourceId
        || chunk.versionId !== expected.versionId || chunk.chunkId !== expected.chunkId
        || chunk.chunkIndex !== expected.chunkIndex || chunk.text !== expected.text
        || chunk.start !== expected.start || chunk.end !== expected.end || !sameLocator(chunk.locator, expected.locator);
    })) throw new KnowledgeError("INVALID_KNOWLEDGE_INPUT");
  return canonical;
}

export type PreparedKnowledgeDocumentVersion =
  | Readonly<{ kind: "success"; version: KnowledgeVersion }>
  | Readonly<{ kind: "failure"; code: KnowledgeExtractionFailureCode }>;

export async function prepareKnowledgeDocumentVersion(
  extractor: KnowledgeDocumentExtractorPort,
  input: Readonly<{
    workspace: TrustedWorkspaceContext;
    sourceId: string;
    versionId: string;
    title: string;
    kind: "pdf" | "csv";
    bytes: Uint8Array;
    createdAt?: string;
  }>,
): Promise<PreparedKnowledgeDocumentVersion> {
  let extraction: KnowledgeDocumentExtractionResult;
  try {
    extraction = await extractor.extract({ kind: input.kind, bytes: input.bytes });
  } catch {
    return Object.freeze({ kind: "failure", code: "MALFORMED_FILE" });
  }
  if (typeof extraction !== "object" || extraction === null) {
    return Object.freeze({ kind: "failure", code: "MALFORMED_FILE" });
  }
  if (extraction.kind === "failure") {
    return extractionFailureCodes.has(extraction.code)
      ? Object.freeze({ kind: "failure", code: extraction.code })
      : Object.freeze({ kind: "failure", code: "MALFORMED_FILE" });
  }
  if (extraction.kind !== "success" || !Array.isArray(extraction.segments)) {
    return Object.freeze({ kind: "failure", code: "MALFORMED_FILE" });
  }
  try {
    return Object.freeze({
      kind: "success",
      version: createImportedKnowledgeVersion({
        workspace: input.workspace,
        sourceId: input.sourceId,
        versionId: input.versionId,
        title: input.title,
        kind: input.kind,
        segments: extraction.segments,
        createdAt: input.createdAt,
      }),
    });
  } catch (error: unknown) {
    if (error instanceof KnowledgeError && error.code === "DOCUMENT_TOO_LARGE") {
      return Object.freeze({ kind: "failure", code: "OUTPUT_TOO_LARGE" });
    }
    if (error instanceof KnowledgeError && error.code === "INVALID_EXTRACTION_RESULT") {
      return Object.freeze({ kind: "failure", code: "MALFORMED_FILE" });
    }
    throw error;
  }
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
  const terms = normalized.match(/[a-z0-9]+(?:[-_./][a-z0-9]+)*|[\u0E00-\u0E7F]+/gu) ?? [];
  const result = new Set(terms);
  // Character bigrams provide a small deterministic Thai baseline without claiming a tokenizer.
  for (const run of normalized.match(/[\u0E00-\u0E7F]+/gu) ?? []) {
    const chars = Array.from(run);
    for (let i = 0; i + 1 < chars.length; i += 1) result.add(chars[i]! + chars[i + 1]!);
  }
  return result;
};

const skuCodePattern = /^(?=.*[a-z])(?=.*\d)[a-z0-9]+(?:[-_./][a-z0-9]+)*$/u;

function analyzeText(text: string): Readonly<{ terms: ReadonlySet<string>; skuCodes: readonly string[] }> {
  const terms = tokens(text);
  return Object.freeze({ terms, skuCodes: Object.freeze([...terms].filter((term) => skuCodePattern.test(term))) });
}

function compactSku(code: string): string {
  return code.replace(/[-_./]/gu, "");
}

function score(
  queryTerms: ReadonlySet<string>,
  querySkuCodes: readonly string[],
  bodyTerms: ReadonlySet<string>,
  bodySkuCodes: readonly string[],
  unambiguousSkuKeys: ReadonlySet<string>,
): number {
  const matches = [...queryTerms].filter((term) => bodyTerms.has(term));
  const exactSku = querySkuCodes.some((queryCode) => bodySkuCodes.some((bodyCode) =>
    queryCode === bodyCode
      || (compactSku(queryCode) === compactSku(bodyCode) && unambiguousSkuKeys.has(compactSku(queryCode)))
  ));
  if (matches.length === 0 && !exactSku) return 0;
  return (exactSku ? 2 : 0) + matches.length / Math.max(queryTerms.size, 1);
}

function compareLocator(a: KnowledgeCitationLocator, b: KnowledgeCitationLocator): number {
  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
  if (a.kind === "span" && b.kind === "span") {
    return a.chunkIndex - b.chunkIndex || a.start - b.start || a.end - b.end;
  }
  if (a.kind === "page" && b.kind === "page") {
    return a.page - b.page || (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0);
  }
  if (a.kind === "row" && b.kind === "row") {
    return a.row - b.row || (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0);
  }
  if (a.kind === "chunk" && b.kind === "chunk") return a.chunkIndex - b.chunkIndex;
  return 0;
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
  const queryAnalysis = analyzeText(query.query);
  const candidates: KnowledgeRetrievalHit[] = [];
  const retrievableItems = await repository.listRetrievableChunks(query.workspace);
  const eligibleItems: Array<Readonly<{
    item: typeof retrievableItems[number];
    terms: ReadonlySet<string>;
    skuCodes: readonly string[];
  }>> = [];
  const skuFormsByKey = new Map<string, Set<string>>();
  for (const item of retrievableItems) {
    assertWorkspace(query.workspace, item.source.workspaceId);
    assertWorkspace(query.workspace, item.version.workspaceId);
    assertWorkspace(query.workspace, item.chunk.workspaceId);
    if (item.source.status !== "active" || item.version.status !== "approved") continue;
    const analysis = analyzeText(item.chunk.text);
    eligibleItems.push({ item, terms: analysis.terms, skuCodes: analysis.skuCodes });
    for (const code of analysis.skuCodes) {
      const key = compactSku(code);
      const forms = skuFormsByKey.get(key) ?? new Set<string>();
      forms.add(code);
      skuFormsByKey.set(key, forms);
    }
  }
  const unambiguousSkuKeys = new Set([...skuFormsByKey]
    .filter(([, forms]) => forms.size === 1)
    .map(([key]) => key));
  for (const eligible of eligibleItems) {
    const { item } = eligible;
    const rank = score(queryAnalysis.terms, queryAnalysis.skuCodes, eligible.terms, eligible.skuCodes, unambiguousSkuKeys);
    if (rank <= 0) continue;
    const citation: KnowledgeCitation = Object.freeze({
      workspaceId: item.chunk.workspaceId,
      sourceId: item.source.sourceId,
      sourceVersionId: item.version.versionId,
      chunkId: item.chunk.chunkId,
      locator: Object.freeze({ ...item.chunk.locator }),
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
    || compareLocator(a.citation.locator, b.citation.locator)
    || a.citation.chunkId.localeCompare(b.citation.chunkId));
  const hits = Object.freeze(candidates.slice(0, query.limit));
  return hits.length > 0 ? Object.freeze({ kind: "evidence", hits }) : Object.freeze({ kind: "no_answer", reason: "NO_APPROVED_EVIDENCE" });
}

export class KnowledgeRetriever implements KnowledgeRetrievalPort {
  constructor(private readonly repository: KnowledgeRepositoryPort) {}
  search(query: KnowledgeRetrievalQuery): Promise<KnowledgeRetrievalResult> {
    return retrieveKnowledge(this.repository, query);
  }
}
