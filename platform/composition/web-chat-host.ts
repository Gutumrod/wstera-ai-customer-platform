import type { ConversationRepositoryPort } from "../contracts/data/conversation.js";
import type { KnowledgeRetrievalPort } from "../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import type { ConversationMessagePort } from "../contracts/data/conversation-messages.js";
import type {
  AnswerabilityPort,
  EvidenceFreshnessPort,
  GroundedAnswerPort,
  SupportEvidence,
  SupportHandoffPort,
} from "../modules/ai-engine/support-orchestrator.js";
import { SupportOrchestrator } from "../modules/ai-engine/support-orchestrator.js";
import { createConversation, requestHandoff as requestConversationHandoff } from "../modules/conversation/index.js";
import { createAnswerPort } from "../adapters/answers/answer-port-factory.js";
import { createExtractiveAnswerPort } from "../adapters/answers/extractive/extractive-answer-port.js";
import { isInjectionOrMarkup, selectSupportingEvidence } from "../adapters/answers/extractive/extractive-answerability-port.js";
import type { SupportResponder } from "./web-chat-routes.js";

/**
 * Everything the Web Chat host may touch. Workspace, connection, conversation
 * id and audience are always resolved server-side (cookie + connection owner);
 * none of them is accepted from the browser.
 */
export type WebChatHostDeps = Readonly<{
  conversations: ConversationRepositoryPort;
  retrieval: KnowledgeRetrievalPort;
  evidenceFreshness: EvidenceFreshnessPort;
  answerability: AnswerabilityPort;
  handoff: SupportHandoffPort;
  messages?: ConversationMessagePort;
  /** Test/alternate wiring. When omitted, the extractive answer port is used. */
  answer?: GroundedAnswerPort;
  /** Only consulted when `answer` is omitted; a model port is built only when enabled === true. */
  model?: Readonly<{ enabled?: boolean; createModelPort?: (context: Readonly<{ conversationId: string }>) => GroundedAnswerPort }>;
  modelGate?: (input: Readonly<{ workspaceId: string; conversationId: string; query: string; evidence: readonly SupportEvidence[] }>) => Promise<unknown | null>;
  broadRetrieval?: (workspace: TrustedWorkspaceContext) => Promise<readonly import("../contracts/data/knowledge.js").KnowledgeRetrievalHit[]>;
  /**
   * Per-workspace [from, to] phrase swaps applied to the question before it
   * reaches the orchestrator (e.g. a shop's word for what its documents call
   * something else). Shop vocabulary lives in workspace data, never in code.
   */
  queryAliases?: (workspace: TrustedWorkspaceContext) => readonly (readonly [string, string])[] | Promise<readonly (readonly [string, string])[]>;
  /** Server clock for conversation timestamps. Returns an ISO-8601 string. */
  now?: () => string;
}>;

export type WebChatHost = Readonly<{
  responder: SupportResponder;
  requestHandoff: (workspace: TrustedWorkspaceContext, conversationId: string) => Promise<void>;
  persistTurn?: (workspace: TrustedWorkspaceContext, conversationId: string, customerText: string, botText: string) => Promise<void>;
  staffUpdates?: (input: Parameters<ConversationMessagePort["staffUpdates"]>[0]) => Promise<Awaited<ReturnType<ConversationMessagePort["staffUpdates"]>> & Readonly<{ handoffOpen: boolean | null }>>;
}>;

const greetingPattern = /^(?:สวัสดี|หวัดดี|ฮัลโหล|ฮัลโล|ฮาโลว?|hello|hi|hey)(?:ครับ|ค่ะ|คะ|คับ|จ้า|จ้ะ|ฮะ)?(?:นะ)?$/u;
const thanksPattern = /^(?:ขอบคุณ|ขอบใจ|thanks?|thankyou)(?:มาก|มากๆ)?(?:ครับ|ค่ะ|คะ|คับ|จ้า|จ้ะ)?(?:นะ)?$/u;

const leadingGreetingPattern = /^(?:สวัสดี|หวัดดี|ฮัลโหล|ฮัลโล|hello|hi)(?:ครับ|ค่ะ|คะ|คับ)?[\s,]+/iu;

/** A message that is only a greeting or thanks (whole message, not a sentence that starts with one). */
function smallTalkReply(query: string): string | null {
  const bare = query.normalize("NFKC").toLowerCase().replace(/[\s!.~ๆ]+/gu, "");
  if (greetingPattern.test(bare)) return "สวัสดีครับ มีอะไรให้ช่วยสอบถามได้เลยครับ";
  if (thanksPattern.test(bare)) return "ยินดีครับ หากมีคำถามเพิ่มเติมสอบถามได้เลยครับ";
  return null;
}

/**
 * The gate and the answer port must agree on what the supporting evidence is.
 * The extractive port copies the first items it is handed, so an unfiltered list
 * would let it quote a document the gate never accepted. This wrapper narrows
 * the list with the same selection function the gate used, and answers nothing
 * when no item survives. It wraps (never edits) the locked answer port.
 */
function withSupportingEvidence(port: GroundedAnswerPort): GroundedAnswerPort {
  return Object.freeze({
    async generate(input: Readonly<{
      workspaceId: string;
      query: string;
      evidence: readonly SupportEvidence[];
    }>) {
      const selected = selectSupportingEvidence(input.query, input.evidence);
      if (selected.length === 0) return null;
      return port.generate(Object.freeze({
        workspaceId: input.workspaceId,
        query: input.query,
        evidence: selected,
      }));
    },
  });
}

/**
 * Wires the orchestrator behind the route layer. The responder ignores the
 * caller-supplied audience on purpose and always answers as "customer"; the
 * route type only ever passes "customer", so this also closes a runtime cast.
 */
export function createWebChatHost(deps: WebChatHostDeps): WebChatHost {
  const now = deps.now ?? (() => new Date().toISOString());
  const orchestratorFor = (conversationId: string, allowModel = true): SupportOrchestrator => {
    const modelFactory = deps.model?.createModelPort;
    const answer = withSupportingEvidence(deps.answer ?? createAnswerPort({
      modelEnabled: allowModel && deps.model?.enabled === true,
      ...(allowModel && modelFactory ? { createModelPort: () => modelFactory({ conversationId }) } : {}),
    }));
    return new SupportOrchestrator({
      conversations: deps.conversations,
      retrieval: deps.retrieval,
      evidenceFreshness: deps.evidenceFreshness,
      answerability: deps.answerability,
      answer,
      handoff: deps.handoff,
    });
  };

  // The page issues a server-side conversation id with the session, but the
  // first message arrives before any conversation row exists. Create it under
  // the server-resolved workspace, tolerating a concurrent first message.
  const ensureConversation = async (workspace: TrustedWorkspaceContext, conversationId: string) => {
    const existing = await deps.conversations.load(workspace, conversationId);
    if (existing !== null) return existing;
    try {
      return await createConversation(deps.conversations, workspace, conversationId, now());
    } catch (error) {
      const raced = await deps.conversations.load(workspace, conversationId).catch(() => null);
      if (raced === null) throw error;
      return raced;
    }
  };

  const responder: SupportResponder = async ({ workspace, conversationId, query }) => {
    const current = await ensureConversation(workspace, conversationId);
    // Small talk stays available while a handoff is waiting; staff ownership pauses the AI.
    const text = smallTalkReply(query);
    if (text !== null && current?.status !== "human_active") {
      return Object.freeze({ kind: "small_talk", text });
    }
    // A greeting in front of a real question is not part of the question.
    let asked = query.replace(leadingGreetingPattern, "") || query;
    try {
      for (const [from, to] of (await deps.queryAliases?.(workspace)) ?? []) {
        if (from.length > 0) asked = asked.split(from).join(to);
      }
    } catch {
      asked = query.replace(leadingGreetingPattern, "") || query;
    }
    let gateFailed = false;
    if (deps.modelGate && deps.broadRetrieval && current?.status !== "human_active"
      && asked.length <= 500 && !isInjectionOrMarkup(asked)) {
      try {
        const [ranked, broad] = await Promise.all([
          deps.retrieval.search({ workspace, query: asked, limit: 8, audience: "customer" }),
          deps.broadRetrieval(workspace),
        ]);
        const merged = new Map<string, import("../contracts/data/knowledge.js").KnowledgeRetrievalHit>();
        if (ranked.kind === "evidence") for (const hit of ranked.hits) merged.set(hit.citation.chunkId, hit);
        for (const hit of broad) if (!merged.has(hit.citation.chunkId)) merged.set(hit.citation.chunkId, hit);
        const hits = [...merged.values()].slice(0, 8);
        let chars = 0;
        const bounded = hits.filter((hit) => {
          const n = hit.text.length;
          if (chars + n > 12_000) return false;
          chars += n; return true;
        });
        const evidence = Object.freeze(bounded.map((hit, i) => Object.freeze({ referenceId: `evidence-${i + 1}`, sourceLabel: hit.title, text: hit.text })));
        const gate = await deps.modelGate({ workspaceId: workspace.workspaceId, conversationId, query: asked, evidence });
        const kind = typeof gate === "object" && gate !== null ? (gate as { kind?: unknown }).kind : null;
        const recognized = ["small_talk", "answerable", "insufficient_evidence", "conflicting_evidence", "uncertain"].includes(String(kind));
        if (!recognized) gateFailed = true;
        if (kind === "small_talk") return Object.freeze({ kind: "small_talk", text: /[\u0E00-\u0E7F]/u.test(asked)
          ? "ฉันเป็นผู้ช่วยของร้านนี้ครับ ลองถามเรื่องร้านได้เลยครับ" : "I’m this shop’s assistant. Feel free to ask about the shop." });
        if (["answerable", "insufficient_evidence", "conflicting_evidence", "uncertain"].includes(String(kind))) {
          const retrieval = { async search() { return bounded.length ? Object.freeze({ kind: "evidence" as const, hits: Object.freeze(bounded) })
            : Object.freeze({ kind: "no_answer" as const, reason: "NO_APPROVED_EVIDENCE" as const }); } };
          const answerability = { async assess() { return Object.freeze({ kind }); } };
          const gateAnswer = deps.model?.enabled === true && deps.model.createModelPort
            ? deps.model.createModelPort({ conversationId })
            : deps.answer ? withSupportingEvidence(deps.answer) : createExtractiveAnswerPort();
          const orchestrator = new SupportOrchestrator({ conversations: deps.conversations, retrieval,
            evidenceFreshness: deps.evidenceFreshness, answerability, answer: gateAnswer, handoff: deps.handoff }, 8);
          return orchestrator.respond({ workspace, conversationId, query: asked, audience: "customer" });
        }
      } catch { gateFailed = true; /* Gate failure deliberately rejoins the unchanged legacy path below. */ }
    }
    return orchestratorFor(conversationId, !gateFailed).respond({ workspace, conversationId, query: asked, audience: "customer" });
  };

  return Object.freeze({
    responder,
    // Customer handoff is intentionally left to a real channel/operator adapter.
    requestHandoff: async (workspace: TrustedWorkspaceContext, conversationId: string) => {
      await ensureConversation(workspace, conversationId);
      await requestConversationHandoff(deps.conversations, workspace, conversationId, "customer_requested", now());
    },
    ...(deps.messages ? {
      persistTurn: (workspace: TrustedWorkspaceContext, conversationId: string, customerText: string, botText: string) =>
        deps.messages!.appendTurn({ workspace, conversationId, customerText, botText }),
      staffUpdates: async (input: Parameters<ConversationMessagePort["staffUpdates"]>[0]) => {
        const result = await deps.messages!.staffUpdates(input);
        // null = status unreadable: staff messages still flow, the page keeps the button as it was.
        const handoffOpen = await deps.conversations.load(input.workspace, input.conversationId)
          .then((conversation) => conversation !== null && conversation.status !== "ai_active", () => null);
        return { ...result, handoffOpen };
      },
    } : {}),
  });
}
