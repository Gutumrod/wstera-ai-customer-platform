import type { TrustedWorkspaceContext } from "../../contracts/tenancy/index.js";
import type { KnowledgeCitation, KnowledgeRetrievalHit } from "../../contracts/data/knowledge.js";

export type CitationIntegrityReason =
  | "NO_APPROVED_EVIDENCE"
  | "INVALID_DRAFT"
  | "EMPTY_ANSWER"
  | "NO_CITATIONS"
  | "INVALID_EVIDENCE_CONTEXT"
  | "CROSS_WORKSPACE_CITATION"
  | "MALFORMED_CITATION"
  | "UNSUPPORTED_CITATION";

export type CitationIntegrityDecision =
  | Readonly<{ kind: "accepted"; answer: Readonly<{ text: string; citations: readonly KnowledgeCitation[] }> }>
  | Readonly<{ kind: "handoff"; reason: CitationIntegrityReason }>;

export type DraftAnswer = Readonly<{ text: string; citations: readonly KnowledgeCitation[] }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function locatorKey(locator: unknown): string | null {
  if (!isRecord(locator)) return null;
  switch (locator.kind) {
    case "span":
      if (!hasOnlyKeys(locator, ["kind", "chunkIndex", "start", "end"])
        || !isNonNegativeInteger(locator.chunkIndex)
        || !isNonNegativeInteger(locator.start)
        || !Number.isSafeInteger(locator.end)
        || (locator.end as number) <= (locator.start as number)) return null;
      return JSON.stringify(["span", locator.chunkIndex, locator.start, locator.end]);
    case "page":
    case "row":
      if (!hasOnlyKeys(locator, ["kind", locator.kind, "chunkIndex"])
        || !Number.isSafeInteger(locator[locator.kind]) || (locator[locator.kind] as number) < 1) return null;
      if (locator.chunkIndex !== undefined && !isNonNegativeInteger(locator.chunkIndex)) return null;
      return JSON.stringify([locator.kind, locator[locator.kind], locator.chunkIndex ?? 0]);
    case "chunk":
      if (!hasOnlyKeys(locator, ["kind", "chunkIndex"]) || !isNonNegativeInteger(locator.chunkIndex)) return null;
      return JSON.stringify(["chunk", locator.chunkIndex]);
    default:
      return null;
  }
}

function citationKey(value: unknown): string | null {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ["workspaceId", "sourceId", "sourceVersionId", "chunkId", "locator"])
    || !isNonEmptyString(value.workspaceId)
    || !isNonEmptyString(value.sourceId)
    || !isNonEmptyString(value.sourceVersionId)
    || !isNonEmptyString(value.chunkId)) return null;
  const key = locatorKey(value.locator);
  if (key === null) return null;
  return JSON.stringify([value.workspaceId, value.sourceId, value.sourceVersionId, value.chunkId, key]);
}

function isCrossWorkspaceCitation(value: unknown, workspaceId: string): boolean {
  return isRecord(value) && typeof value.workspaceId === "string" && value.workspaceId !== workspaceId;
}

function isDraftAnswer(value: unknown): value is DraftAnswer {
  return isRecord(value) && typeof value.text === "string" && Array.isArray(value.citations);
}

/**
 * Check citation identity against already retrieved evidence for one server-resolved workspace.
 * Callers must pass evidence from the trusted, tenant-scoped retrieval path; this function cannot
 * authenticate arbitrary hits or re-check approval/source status from citation data alone.
 * This proves provenance only; it does not prove that cited text semantically supports the answer.
 */
export function validateAnswerCitations(
  workspace: TrustedWorkspaceContext,
  draft: unknown,
  evidence: readonly KnowledgeRetrievalHit[],
): CitationIntegrityDecision {
  if (evidence.length === 0) return Object.freeze({ kind: "handoff", reason: "NO_APPROVED_EVIDENCE" });

  const evidenceByKey = new Map<string, KnowledgeCitation>();
  for (const hit of evidence) {
    const rawHit = hit as unknown;
    if (!isRecord(rawHit)) return Object.freeze({ kind: "handoff", reason: "INVALID_EVIDENCE_CONTEXT" });
    const citation = rawHit.citation;
    if (citationKey(citation) === null || !isRecord(citation) || citation.workspaceId !== workspace.workspaceId
      || rawHit.sourceId !== citation.sourceId || rawHit.versionId !== citation.sourceVersionId
      || !isNonEmptyString(rawHit.text) || typeof rawHit.score !== "number" || !Number.isFinite(rawHit.score) || rawHit.score <= 0) {
      return Object.freeze({ kind: "handoff", reason: "INVALID_EVIDENCE_CONTEXT" });
    }
    evidenceByKey.set(citationKey(citation)!, citation as KnowledgeCitation);
  }

  if (!isDraftAnswer(draft)) return Object.freeze({ kind: "handoff", reason: "INVALID_DRAFT" });
  if (!draft.text.trim()) return Object.freeze({ kind: "handoff", reason: "EMPTY_ANSWER" });
  if (draft.citations.length === 0) return Object.freeze({ kind: "handoff", reason: "NO_CITATIONS" });

  const accepted: KnowledgeCitation[] = [];
  const seen = new Set<string>();
  for (const citation of draft.citations as readonly unknown[]) {
    if (isCrossWorkspaceCitation(citation, workspace.workspaceId)) {
      return Object.freeze({ kind: "handoff", reason: "CROSS_WORKSPACE_CITATION" });
    }
    const key = citationKey(citation);
    if (key === null) return Object.freeze({ kind: "handoff", reason: "MALFORMED_CITATION" });
    const canonical = evidenceByKey.get(key);
    if (!canonical) return Object.freeze({ kind: "handoff", reason: "UNSUPPORTED_CITATION" });
    if (!seen.has(key)) {
      seen.add(key);
      accepted.push(canonical);
    }
  }
  return Object.freeze({
    kind: "accepted",
    answer: Object.freeze({ text: draft.text, citations: Object.freeze(accepted) }),
  });
}
