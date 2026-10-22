import { MAX_KNOWLEDGE_QUERY_CHARS, MAX_SUPPORT_QUERY_CHARS, type KnowledgeCitation, type KnowledgeRetrievalHit, type KnowledgeRetrievalPort } from "../../contracts/data/knowledge.js";
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
  assess(input: Readonly<{ workspaceId: string; query: string; evidence: readonly SupportEvidence[] }>): Promise<unknown>;
}

/** Returns only opaque evidence references; the engine maps them to canonical citations. */
export interface GroundedAnswerPort {
  generate(input: Readonly<{ workspaceId: string; query: string; evidence: readonly SupportEvidence[] }>): Promise<unknown>;
}

/** Rechecks source/version approval after model generation to reject stale evidence. */
export interface EvidenceFreshnessPort {
  areCurrentAndApproved(workspace: TrustedWorkspaceContext, citations: readonly KnowledgeCitation[]): Promise<boolean>;
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
  | "UNSUPPORTED_CITATION"
  | "KNOWLEDGE_CHANGED"
  | "QUERY_TOO_LONG";

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
  | Readonly<{ kind: "conversation_changed" }>
  | Readonly<{ kind: "conversation_unavailable" }>
  | Readonly<{ kind: "invalid_request" }>;

export type SupportOrchestratorPorts = Readonly<{
  conversations: Pick<ConversationRepositoryPort, "load">;
  retrieval: KnowledgeRetrievalPort;
  evidenceFreshness: EvidenceFreshnessPort;
  answerability: AnswerabilityPort;
  answer: GroundedAnswerPort;
  handoff: SupportHandoffPort;
}>;

type GeneratedDraft = Readonly<{ text: string; citationRefs: readonly string[] }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyDataProperties(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && allowed.includes(key)
    && Object.prototype.hasOwnProperty.call(descriptors, key) && "value" in descriptors[key]!);
}

function snapshotArrayValues(value: unknown, limit: number): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const ownKeys = Reflect.ownKeys(value);
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > limit || ownKeys.length !== length + 1 || !ownKeys.includes("length")) return null;
    const values: unknown[] = [];
    for (let index = 0; index < length; index++) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor)) return null;
      values.push(descriptor.value);
    }
    return values;
  } catch {
    return null;
  }
}

function parseGeneratedDraft(value: unknown, citationLimit: number): GeneratedDraft | null {
  try {
    if (!isRecord(value) || !hasOnlyDataProperties(value, ["text", "citationRefs"])) return null;
    const fields = Object.getOwnPropertyDescriptors(value);
    const text = fields.text?.value;
    const references = fields.citationRefs?.value;
    if (typeof text !== "string" || text.length > 16_000) return null;
    const referenceValues = snapshotArrayValues(references, citationLimit);
    if (!referenceValues || referenceValues.length === 0) return null;
    const copiedReferences: string[] = [];
    for (const reference of referenceValues) {
      if (typeof reference !== "string" || reference.length > 64) return null;
      copiedReferences.push(reference);
    }
    return Object.freeze({ text, citationRefs: Object.freeze(copiedReferences) });
  } catch {
    return null;
  }
}

function snapshotConversation(value: unknown, workspaceId: string, conversationId: string): ConversationSnapshot | null {
  try {
    if (!isRecord(value) || !hasOnlyDataProperties(value, ["workspaceId", "conversationId", "status", "version", "createdAt", "updatedAt", "handoffReason", "assignedStaffId", "lastStaffDeliveryId"])) return null;
    const fields = Object.getOwnPropertyDescriptors(value);
    const observedWorkspaceId = fields.workspaceId?.value;
    const observedConversationId = fields.conversationId?.value;
    const status = fields.status?.value;
    const version = fields.version?.value;
    const createdAt = fields.createdAt?.value;
    const updatedAt = fields.updatedAt?.value;
    if (observedWorkspaceId !== workspaceId || observedConversationId !== conversationId
      || (status !== "ai_active" && status !== "handoff_requested" && status !== "human_active")
      || !Number.isSafeInteger(version) || (version as number) < 0
      || typeof createdAt !== "string" || typeof updatedAt !== "string") return null;
    return Object.freeze({
      workspaceId: observedWorkspaceId,
      conversationId: observedConversationId,
      status,
      version: version as number,
      createdAt,
      updatedAt,
    });
  } catch {
    return null;
  }
}

function snapshotRetrievalHit(value: unknown): KnowledgeRetrievalHit | null {
  try {
    if (!isRecord(value) || !hasOnlyDataProperties(value, ["sourceId", "versionId", "title", "text", "score", "citation"])) return null;
    const hitFields = Object.getOwnPropertyDescriptors(value);
    const sourceId = hitFields.sourceId?.value;
    const versionId = hitFields.versionId?.value;
    const title = hitFields.title?.value;
    const text = hitFields.text?.value;
    const score = hitFields.score?.value;
    const rawCitation = hitFields.citation?.value;
    if (typeof sourceId !== "string" || sourceId.trim().length === 0
      || typeof versionId !== "string" || versionId.trim().length === 0
      || typeof title !== "string" || typeof text !== "string" || text.trim().length === 0
      || typeof score !== "number" || !Number.isFinite(score) || score <= 0
      || !isRecord(rawCitation) || !hasOnlyDataProperties(rawCitation, ["workspaceId", "sourceId", "sourceVersionId", "chunkId", "locator"])) return null;
    const citationFields = Object.getOwnPropertyDescriptors(rawCitation);
    const workspaceId = citationFields.workspaceId?.value;
    const citationSourceId = citationFields.sourceId?.value;
    const sourceVersionId = citationFields.sourceVersionId?.value;
    const chunkId = citationFields.chunkId?.value;
    const rawLocator = citationFields.locator?.value;
    if (!isRecord(rawLocator) || !hasOnlyDataProperties(rawLocator, ["kind", "chunkIndex", "start", "end", "page", "row"])) return null;
    const locatorFields = Object.getOwnPropertyDescriptors(rawLocator);
    const locatorKind = locatorFields.kind?.value;
    let locator: KnowledgeCitation["locator"];
    if (locatorKind === "span") {
      const chunkIndex = locatorFields.chunkIndex?.value;
      const start = locatorFields.start?.value;
      const end = locatorFields.end?.value;
      locator = Object.freeze({ kind: "span", chunkIndex: chunkIndex as number, start: start as number, end: end as number });
    } else if (locatorKind === "page" || locatorKind === "row") {
      const position = locatorFields[locatorKind]?.value;
      const chunkIndex = locatorFields.chunkIndex?.value;
      locator = Object.freeze(chunkIndex === undefined
        ? { kind: locatorKind, [locatorKind]: position } as KnowledgeCitation["locator"]
        : { kind: locatorKind, [locatorKind]: position, chunkIndex } as KnowledgeCitation["locator"]);
    } else if (locatorKind === "chunk") {
      const chunkIndex = locatorFields.chunkIndex?.value;
      locator = Object.freeze({ kind: "chunk", chunkIndex: chunkIndex as number });
    } else return null;
    const citation: KnowledgeCitation = Object.freeze({
      workspaceId: workspaceId as string,
      sourceId: citationSourceId as string,
      sourceVersionId: sourceVersionId as string,
      chunkId: chunkId as string,
      locator,
    });
    return Object.freeze({ sourceId, versionId, title, text, score, citation });
  } catch {
    return null;
  }
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
    if (!isRecord(value) || !hasOnlyDataProperties(value, ["kind"])) return null;
    const fields = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(value).length !== 1) return null;
    const kind = fields.kind?.value;
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
      || typeof input.query !== "string" || input.query.trim().length === 0 || input.query.length > MAX_SUPPORT_QUERY_CHARS) {
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
    const guardedRequest = Object.freeze({ ...request, expectedConversationVersion: initialConversation.snapshot.version });
    if (request.query.length > MAX_KNOWLEDGE_QUERY_CHARS) return this.handoff(guardedRequest, "QUERY_TOO_LONG");

    let retrieval: unknown;
    try {
      retrieval = await this.ports.retrieval.search({ workspace: request.workspace, query: request.query, limit: this.evidenceLimit });
    } catch {
      return this.handoff(guardedRequest, "RETRIEVAL_UNAVAILABLE");
    }
    let hits: readonly KnowledgeRetrievalHit[];
    try {
      if (!isRecord(retrieval) || !hasOnlyDataProperties(retrieval, ["kind", "hits", "reason"])) return this.handoff(guardedRequest, "RETRIEVAL_UNAVAILABLE");
      const resultFields = Object.getOwnPropertyDescriptors(retrieval);
      const resultKind = resultFields.kind?.value;
      if (Reflect.ownKeys(retrieval).length !== 2) return this.handoff(guardedRequest, "RETRIEVAL_UNAVAILABLE");
      if (resultKind === "no_answer") {
        if (resultFields.reason?.value !== "NO_APPROVED_EVIDENCE") {
          return this.handoff(guardedRequest, "RETRIEVAL_UNAVAILABLE");
        }
        return this.handoff(guardedRequest, "NO_APPROVED_EVIDENCE");
      }
      const retrievedValues = snapshotArrayValues(resultFields.hits?.value, this.evidenceLimit);
      if (resultKind !== "evidence" || !retrievedValues || retrievedValues.length === 0) {
        return this.handoff(guardedRequest, "RETRIEVAL_UNAVAILABLE");
      }
      const canonicalHits = retrievedValues.map((hit) => snapshotRetrievalHit(hit));
      if (canonicalHits.some((hit) => hit === null)) return this.handoff(guardedRequest, "RETRIEVAL_UNAVAILABLE");
      hits = Object.freeze(canonicalHits as KnowledgeRetrievalHit[]);
      const retrievedIntegrity = validateAnswerCitations(request.workspace, {
        text: "retrieved evidence validation",
        citations: hits.map((hit) => hit.citation),
      }, hits);
      if (retrievedIntegrity.kind !== "accepted") return this.handoff(guardedRequest, "RETRIEVAL_UNAVAILABLE");
    } catch {
      return this.handoff(guardedRequest, "RETRIEVAL_UNAVAILABLE");
    }

    let evidence: readonly SupportEvidence[];
    try {
      evidence = Object.freeze(hits.map((hit, index) => Object.freeze({
        referenceId: `evidence-${index + 1}`,
        sourceLabel: hit.title,
        text: hit.text,
      })));
    } catch {
      return this.handoff(guardedRequest, "RETRIEVAL_UNAVAILABLE");
    }

    let assessment: unknown;
    try {
      assessment = await this.ports.answerability.assess({ workspaceId: request.workspace.workspaceId, query: request.query, evidence });
    } catch {
      return this.handoff(guardedRequest, "ANSWERABILITY_UNAVAILABLE");
    }
    const assessmentKind = parseAssessmentKind(assessment);
    if (!assessmentKind) return this.handoff(guardedRequest, "ANSWERABILITY_UNAVAILABLE");
    if (assessmentKind === "insufficient_evidence") return this.handoff(guardedRequest, "INSUFFICIENT_EVIDENCE");
    if (assessmentKind === "conflicting_evidence") return this.handoff(guardedRequest, "CONFLICTING_EVIDENCE");
    if (assessmentKind === "uncertain") return this.handoff(guardedRequest, "UNCERTAIN_ANSWERABILITY");

    let generated: unknown;
    try {
      generated = await this.ports.answer.generate({ workspaceId: request.workspace.workspaceId, query: request.query, evidence });
    } catch {
      return this.handoff(guardedRequest, "GENERATION_UNAVAILABLE");
    }
    const draft = parseGeneratedDraft(generated, hits.length);
    if (!draft) return this.handoff(guardedRequest, "INVALID_GENERATED_ANSWER");

    let integrity;
    try {
      const hitsByReference = new Map(evidence.map((item, index) => [item.referenceId, hits[index]!] as const));
      const citedHits: KnowledgeRetrievalHit[] = [];
      for (const reference of draft.citationRefs) {
        const hit = hitsByReference.get(reference);
        if (!hit) return this.handoff(guardedRequest, "UNSUPPORTED_CITATION");
        citedHits.push(hit);
      }
      const citations = citedHits.map((hit) => hit.citation);
      integrity = validateAnswerCitations(request.workspace, { text: draft.text, citations }, citedHits);
    } catch {
      return this.handoff(guardedRequest, "RESPONSE_PIPELINE_UNAVAILABLE");
    }
    if (integrity.kind !== "accepted") {
      const reason: SupportHandoffReason = integrity.reason === "UNSUPPORTED_CITATION"
        || integrity.reason === "CROSS_WORKSPACE_CITATION"
        || integrity.reason === "MALFORMED_CITATION"
        ? "UNSUPPORTED_CITATION"
        : "INVALID_GENERATED_ANSWER";
      return this.handoff(guardedRequest, reason);
    }
    try {
      if (await this.ports.evidenceFreshness.areCurrentAndApproved(request.workspace, hits.map((hit) => hit.citation)) !== true) {
        return this.handoff(guardedRequest, "KNOWLEDGE_CHANGED");
      }
    } catch {
      return this.handoff(guardedRequest, "KNOWLEDGE_CHANGED");
    }
    const currentConversation = await this.loadConversation(request);
    if (currentConversation.kind !== "loaded") return currentConversation;
    if (currentConversation.snapshot.status !== "ai_active") return Object.freeze({ kind: "ai_paused" });
    if (currentConversation.snapshot.version !== initialConversation.snapshot.version) return Object.freeze({ kind: "conversation_changed" });
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
      const canonicalSnapshot = snapshotConversation(snapshot, input.workspace.workspaceId, input.conversationId);
      if (!canonicalSnapshot) {
        return Object.freeze({ kind: "conversation_unavailable" });
      }
      return Object.freeze({ kind: "loaded", snapshot: canonicalSnapshot });
    } catch {
      return Object.freeze({ kind: "conversation_unavailable" });
    }
  }

  private async handoff(
    input: Readonly<{ workspace: TrustedWorkspaceContext; conversationId: string; expectedConversationVersion?: number }>,
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
      || reason === "KNOWLEDGE_CHANGED"
      || reason === "QUERY_TOO_LONG"
      || reason === "INVALID_GENERATED_ANSWER"
      ? reason
      : "INVALID_GENERATED_ANSWER";
    if (input.expectedConversationVersion !== undefined) {
      const current = await this.loadConversation(input);
      if (current.kind !== "loaded") return current;
      if (current.snapshot.status !== "ai_active") return Object.freeze({ kind: "ai_paused" });
      if (current.snapshot.version !== input.expectedConversationVersion) return Object.freeze({ kind: "conversation_changed" });
    }
    try {
      await this.ports.handoff.request({ workspace: input.workspace, conversationId: input.conversationId, reason: normalizedReason });
      return Object.freeze({ kind: "handoff_requested", reason: normalizedReason });
    } catch {
      return Object.freeze({ kind: "handoff_unavailable", reason: normalizedReason });
    }
  }
}
