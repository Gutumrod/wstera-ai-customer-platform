import type { ConversationRepositoryPort } from "../contracts/data/conversation.js";
import type { KnowledgeRetrievalPort } from "../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
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
import { selectSupportingEvidence } from "../adapters/answers/extractive/extractive-answerability-port.js";
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
  /** Test/alternate wiring. When omitted, the extractive answer port is used. */
  answer?: GroundedAnswerPort;
  /** Only consulted when `answer` is omitted; a model port is built only when enabled === true. */
  model?: Readonly<{ enabled?: boolean; createModelPort?: () => GroundedAnswerPort }>;
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
  const answer = withSupportingEvidence(deps.answer ?? createAnswerPort({
    modelEnabled: deps.model?.enabled === true,
    ...(deps.model?.createModelPort ? { createModelPort: deps.model.createModelPort } : {}),
  }));
  const orchestrator = new SupportOrchestrator({
    conversations: deps.conversations,
    retrieval: deps.retrieval,
    evidenceFreshness: deps.evidenceFreshness,
    answerability: deps.answerability,
    answer,
    handoff: deps.handoff,
  });

  // The page issues a server-side conversation id with the session, but the
  // first message arrives before any conversation row exists. Create it under
  // the server-resolved workspace, tolerating a concurrent first message.
  const ensureConversation = async (workspace: TrustedWorkspaceContext, conversationId: string): Promise<void> => {
    const existing = await deps.conversations.load(workspace, conversationId);
    if (existing !== null) return;
    try {
      await createConversation(deps.conversations, workspace, conversationId, now());
    } catch (error) {
      const raced = await deps.conversations.load(workspace, conversationId).catch(() => null);
      if (raced === null) throw error;
    }
  };

  const responder: SupportResponder = async ({ workspace, conversationId, query }) => {
    await ensureConversation(workspace, conversationId);
    // Small talk is answered only while the AI owns the conversation; once handed off, the normal path decides.
    const text = smallTalkReply(query);
    if (text !== null && (await deps.conversations.load(workspace, conversationId))?.status === "ai_active") {
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
    return orchestrator.respond({ workspace, conversationId, query: asked, audience: "customer" });
  };

  return Object.freeze({
    responder,
    // Customer handoff is intentionally left to a real channel/operator adapter.
    requestHandoff: async (workspace: TrustedWorkspaceContext, conversationId: string) => {
      await ensureConversation(workspace, conversationId);
      await requestConversationHandoff(deps.conversations, workspace, conversationId, "customer_requested", now());
    },
  });
}
