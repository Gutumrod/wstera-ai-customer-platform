import { enforceWorkspace, type TrustedWorkspace } from "../core/workspace.js";

/**
 * New port-level candidate selection inspired by sales-service-engine
 * KnowledgePort and ai-service-workflow's fallback rules.
 * NOT semantic RAG or factual answerability validation; only filters
 * approved non-empty, workspace-scoped sources before any model use.
 */
export type KnowledgeHit = Readonly<{
  workspaceId: string;
  sourceId: string;
  approved: boolean;
  excerpt: string;
}>;

export type AnswerDecision =
  | Readonly<{ kind: "candidate_context"; sources: readonly KnowledgeHit[] }>
  | Readonly<{ kind: "handoff"; reason: "NO_APPROVED_KNOWLEDGE" }>;

export function evaluateAnswerSources(
  workspace: TrustedWorkspace,
  hits: readonly KnowledgeHit[],
): AnswerDecision {
  for (const hit of hits) enforceWorkspace(workspace, hit.workspaceId);
  const sources = hits.filter((hit) =>
    hit.approved && hit.sourceId.trim().length > 0 && hit.excerpt.trim().length > 0
  );
  return sources.length > 0
    ? { kind: "candidate_context", sources }
    : { kind: "handoff", reason: "NO_APPROVED_KNOWLEDGE" };
}
