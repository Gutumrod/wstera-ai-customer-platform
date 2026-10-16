import type { KnowledgeCitation, KnowledgeRetrievalHit, KnowledgeRetrievalPort } from "../../contracts/data/knowledge.js";
import type { ConversationRepositoryPort, ConversationSnapshot } from "../../contracts/data/conversation.js";
import type { TrustedWorkspaceContext } from "../../contracts/tenancy/index.js";
import { validateAnswerCitations, type CitationIntegrityReason } from "./citation-integrity.js";

export type SupportEvidence = Readonly<{
  referenceId: string;
  sourceLabel: string;
  text: string;
}>;

export type AnswerabilityAssessment =
  | Readonly<{ kind: "answerable" }>
  | Readonly<{ kind: "insufficient_evidence" }>
  | Readonly<{ kind: "conflicting_evidence" }>
  | Readonly<{ kind: "uncertain" }>;

/** Provider-neutral port. Implementations must treat evidence text as untrusted data. */
export interface AnswerabilityPort {
  assess(input: Readonly<{ query: string; evidence: readonly SupportEvidence[] }>): Promise<unknown>;
}

/** Returns only opaque evidence references; the engine maps them to canonical citations. */
export interface GroundedAnswerPort {
  generate(input: Readonly<{ query: string; evidence: readonly SupportEvidence[] }>): Promise<unknown>;
}

export type SupportHandoffReason =
  | "NO_APPROVED_EVIDENCE"
  | "INSUFFICIENT_EVIDENCE"
  | "CONFLICTING_EVIDENCE"
  | "UNCERTAIN_ANSWERABILITY"
  | "ANSWERABILITY_UNAVAILABLE"
  | "GENERATION_UNAVAILABLE"
  | "INVALID_GENERATED_ANSWER"
  | "RETRIEVAL_UNAVAILABLE"
  | "RESPONSE_PIPELINE_UNAVAILABLE"
  | "UNSUPPORTED_CITATION";

export interface SupportHandoffPort {
  request(input: Readonly<{
    workspace: TrustedWorkspaceContext;
    conversationId: string;
    reason: SupportHandoffReason;
  }>): Promise<void>;
}

export type SupportReply =
  | Readonly<{ kind: "answer"; text: string; citations: readonly KnowledgeCitation[]; conversationVersion: number }>
  | Readonly<{ kind: "handoff_requested"; reason: SupportHandoffReason }>
  | Readonly<{ kind: "handoff_unavailable"; reason: SupportHandoffReason }>
  | Readonly<{ kind: "ai_paused" }>
  | Readonly<{ kind: "conversation_unavailable" }>
  | Readonly<{ kind: "invalid_request" }>;

export type SupportOrchestratorPorts = Readonly<{
  conversations: Pick<ConversationRepositoryPort, "load">;
  retrieval: KnowledgeRetrievalPort;
  answerability: AnswerabilityPort;
  answer: GroundedAnswerPort;
  handoff: SupportHandoffPort;
}>;

type GeneratedDraft = Readonly<{ text: string; citationRefs: readonly string[] }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGeneratedDraft(value: unknown, citationLimit: number): GeneratedDraft | null {
  try {
    if (!isRecord(value) || !Object.keys(value).every((key) => key === "text" || key === "citationRefs")) return null;
    const text = value.text;
    const references = value.citationRefs;
    if (typeof text !== "string" || text.length > 16_000
      || !Array.isArray(references) || references.length === 0 || references.length > citationLimit
      || !references.every((reference) => typeof reference === "string" && reference.length <= 64)) return null;
    return Object.freeze({ text, citationRefs: Object.freeze([...references]) });
  } catch {
    return null;
  }
}

function isConversationSnapshot(value: unknown, workspaceId: string, conversationId: string): value is ConversationSnapshot {
  return isRecord(value)
    && value.workspaceId === workspaceId
    && value.conversationId === conversationId
    && (value.status === "ai_active" || value.status === "handoff_requested" || value.status === "human_active")
    && Number.isSafeInteger(value.version) && (value.version as number) >= 0;
}

function isRetrievalHit(value: unknown): value is KnowledgeRetrievalHit {
  return isRecord(value)
    && Object.keys(value).every((key) => ["sourceId", "versionId", "title", "text", "score", "citation"].includes(key))
    && typeof value.sourceId === "string" && value.sourceId.trim().length > 0
    && typeof value.versionId === "string" && value.versionId.trim().length > 0
    && typeof value.title === "string"
    && typeof value.text === "string" && value.text.trim().length > 0
    && typeof value.score === "number" && Number.isFinite(value.score) && value.score > 0
    && isRecord(value.citation);
}

function snapshotWorkspaceContext(value: unknown): TrustedWorkspaceContext | null {
  if (!isRecord(value)) return null;
  const workspaceId = value.workspaceId;
  const connectionId = value.connectionId;
  const channel = value.channel;
  const id = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
  if (typeof workspaceId !== "string" || !id.test(workspaceId)
    || typeof connectionId !== "string" || !id.test(connectionId)
    || (channel !== "web" && channel !== "line")) return null;
  return Object.freeze({ workspaceId, connectionId, channel });
}

function parseAssessmentKind(value: unknown): AnswerabilityAssessment["kind"] | null {
  try {
    if (!isRecord(value) || Object.keys(value).length !== 1) return null;
    const kind = value.kind;
    return kind === "answerable"
      || kind === "insufficient_evidence"
      || kind === "conflicting_evidence"
      || kind === "uncertain"
      ? kind
      : null;
  } catch {
    return null;
  }
}

export class SupportOrchestrator {
  constructor(private readonly ports: SupportOrchestratorPorts, private readonly evidenceLimit = 5) {
    if (!Number.isSafeInteger(evidenceLimit) || evidenceLimit < 1 || evidenceLimit > 20) {
      throw new RangeError("INVALID_EVIDENCE_LIMIT");
    }
  }

  async respond(input: Readonly<{
    workspace: TrustedWorkspaceContext;
    conversationId: string;
    query: string;
  }>): Promise<SupportReply> {
    // Shape checks are defensive only; callers must resolve this context from a trusted server binding.
    if (!isRecord(input)
      || typeof input.conversationId !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.conversationId)
      || typeof input.query !== "string" || input.query.trim().length === 0 || input.query.length > 8_000) {
      return Object.freeze({ kind: "invalid_request" });
    }
    let workspace: TrustedWorkspaceContext | null;
    try {
      workspace = snapshotWorkspaceContext(input.workspace);
    } catch {
      return Object.freeze({ kind: "invalid_request" });
    }
    if (!workspace) return Object.freeze({ kind: "invalid_request" });
    const request = Object.freeze({
      workspace,
      conversationId: input.conversationId,
      query: input.query,
    });

    const initialConversation = await this.loadConversation(request);
    if (initialConversation.kind !== "loaded") return initialConversation;
    if (initialConversation.snapshot.status !== "ai_active") return Object.freeze({ kind: "ai_paused" });

    let retrieval: unknown;
    try {
      retrieval = await this.ports.retrieval.search({ workspace: request.workspace, query: request.query, limit: this.evidenceLimit });
    } catch {
      return this.handoff(request, "RETRIEVAL_UNAVAILABLE");
    }
    let hits: readonly KnowledgeRetrievalHit[];
    try {
      if (!isRecord(retrieval)) return this.handoff(request, "RETRIEVAL_UNAVAILABLE");
      if (retrieval.kind === "no_answer") {
        if (Object.keys(retrieval).length !== 2 || retrieval.reason !== "NO_APPROVED_EVIDENCE") {
          return this.handoff(request, "RETRIEVAL_UNAVAILABLE");
        }
        return this.handoff(request, "NO_APPROVED_EVIDENCE");
      }
      if (retrieval.kind !== "evidence" || Object.keys(retrieval).length !== 2
        || !Array.isArray(retrieval.hits) || retrieval.hits.length === 0
        || retrieval.hits.length > this.evidenceLimit || !retrieval.hits.every(isRetrievalHit)) {
        return this.handoff(request, "RETRIEVAL_UNAVAILABLE");
      }
      hits = retrieval.hits;
      const retrievedIntegrity = validateAnswerCitations(request.workspace, {
        text: "retrieved evidence validation",
        citations: hits.map((hit) => hit.citation),
      }, hits);
      if (retrievedIntegrity.kind !== "accepted") return this.handoff(request, "RETRIEVAL_UNAVAILABLE");
    } catch {
      return this.handoff(request, "RETRIEVAL_UNAVAILABLE");
    }

    let evidence: readonly SupportEvidence[];
    try {
      evidence = Object.freeze(hits.map((hit, index) => Object.freeze({
        referenceId: `evidence-${index + 1}`,
        sourceLabel: hit.title,
        text: hit.text,
      })));
    } catch {
      return this.handoff(request, "RETRIEVAL_UNAVAILABLE");
    }

    let assessment: unknown;
    try {
      assessment = await this.ports.answerability.assess({ query: request.query, evidence });
    } catch {
      return this.handoff(request, "ANSWERABILITY_UNAVAILABLE");
    }
    const assessmentKind = parseAssessmentKind(assessment);
    if (!assessmentKind) return this.handoff(request, "ANSWERABILITY_UNAVAILABLE");
    if (assessmentKind === "insufficient_evidence") return this.handoff(request, "INSUFFICIENT_EVIDENCE");
    if (assessmentKind === "conflicting_evidence") return this.handoff(request, "CONFLICTING_EVIDENCE");
    if (assessmentKind === "uncertain") return this.handoff(request, "UNCERTAIN_ANSWERABILITY");

    let generated: unknown;
    try {
      generated = await this.ports.answer.generate({ query: request.query, evidence });
    } catch {
      return this.handoff(request, "GENERATION_UNAVAILABLE");
    }
    const draft = parseGeneratedDraft(generated, hits.length);
    if (!draft) return this.handoff(request, "INVALID_GENERATED_ANSWER");

    let integrity;
    try {
      const hitsByReference = new Map(evidence.map((item, index) => [item.referenceId, hits[index]!] as const));
      const citedHits: KnowledgeRetrievalHit[] = [];
      for (const reference of draft.citationRefs) {
        const hit = hitsByReference.get(reference);
        if (!hit) return this.handoff(request, "UNSUPPORTED_CITATION");
        citedHits.push(hit);
      }
      const citations = citedHits.map((hit) => hit.citation);
      integrity = validateAnswerCitations(request.workspace, { text: draft.text, citations }, citedHits);
    } catch {
      return this.handoff(request, "RESPONSE_PIPELINE_UNAVAILABLE");
    }
    if (integrity.kind !== "accepted") {
      const reason: SupportHandoffReason = integrity.reason === "UNSUPPORTED_CITATION"
        || integrity.reason === "CROSS_WORKSPACE_CITATION"
        || integrity.reason === "MALFORMED_CITATION"
        ? "UNSUPPORTED_CITATION"
        : "INVALID_GENERATED_ANSWER";
      return this.handoff(request, reason);
    }
    const currentConversation = await this.loadConversation(request);
    if (currentConversation.kind !== "loaded") return currentConversation;
    if (currentConversation.snapshot.status !== "ai_active") return Object.freeze({ kind: "ai_paused" });
    return Object.freeze({
      kind: "answer",
      text: integrity.answer.text,
      citations: integrity.answer.citations,
      conversationVersion: currentConversation.snapshot.version,
    });
  }

  private async loadConversation(
    input: Readonly<{ workspace: TrustedWorkspaceContext; conversationId: string }>,
  ): Promise<Readonly<{ kind: "loaded"; snapshot: ConversationSnapshot }> | Readonly<{ kind: "conversation_unavailable" }>> {
    try {
      const snapshot = await this.ports.conversations.load(input.workspace, input.conversationId);
      if (!snapshot || !isConversationSnapshot(snapshot, input.workspace.workspaceId, input.conversationId)) {
        return Object.freeze({ kind: "conversation_unavailable" });
      }
      return Object.freeze({ kind: "loaded", snapshot });
    } catch {
      return Object.freeze({ kind: "conversation_unavailable" });
    }
  }

  private async handoff(
    input: Readonly<{ workspace: TrustedWorkspaceContext; conversationId: string }>,
    reason: SupportHandoffReason | CitationIntegrityReason,
  ): Promise<SupportReply> {
    const normalizedReason: SupportHandoffReason = reason === "NO_APPROVED_EVIDENCE"
      || reason === "INSUFFICIENT_EVIDENCE"
      || reason === "CONFLICTING_EVIDENCE"
      || reason === "UNCERTAIN_ANSWERABILITY"
      || reason === "ANSWERABILITY_UNAVAILABLE"
      || reason === "GENERATION_UNAVAILABLE"
      || reason === "RETRIEVAL_UNAVAILABLE"
      || reason === "RESPONSE_PIPELINE_UNAVAILABLE"
      || reason === "UNSUPPORTED_CITATION"
      || reason === "INVALID_GENERATED_ANSWER"
      ? reason
      : "INVALID_GENERATED_ANSWER";
    try {
      await this.ports.handoff.request({ workspace: input.workspace, conversationId: input.conversationId, reason: normalizedReason });
      return Object.freeze({ kind: "handoff_requested", reason: normalizedReason });
    } catch {
      return Object.freeze({ kind: "handoff_unavailable", reason: normalizedReason });
    }
  }
}
