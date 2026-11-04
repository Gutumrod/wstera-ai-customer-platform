import type { ConversationRepositoryPort } from "../contracts/data/conversation.js";
import type { KnowledgeRetrievalPort } from "../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import type {
  AnswerabilityPort,
  EvidenceFreshnessPort,
  GroundedAnswerPort,
  SupportHandoffPort,
} from "../modules/ai-engine/support-orchestrator.js";
import { SupportOrchestrator } from "../modules/ai-engine/support-orchestrator.js";
import { createConversation, requestHandoff as requestConversationHandoff } from "../modules/conversation/index.js";
import { createAnswerPort } from "../adapters/answers/answer-port-factory.js";
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
  /** Server clock for conversation timestamps. Returns an ISO-8601 string. */
  now?: () => string;
}>;

export type WebChatHost = Readonly<{
  responder: SupportResponder;
  requestHandoff: (workspace: TrustedWorkspaceContext, conversationId: string) => Promise<void>;
}>;

/**
 * Wires the orchestrator behind the route layer. The responder ignores the
 * caller-supplied audience on purpose and always answers as "customer"; the
 * route type only ever passes "customer", so this also closes a runtime cast.
 */
export function createWebChatHost(deps: WebChatHostDeps): WebChatHost {
  const now = deps.now ?? (() => new Date().toISOString());
  const answer = deps.answer ?? createAnswerPort({
    modelEnabled: deps.model?.enabled === true,
    ...(deps.model?.createModelPort ? { createModelPort: deps.model.createModelPort } : {}),
  });
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
    return orchestrator.respond({ workspace, conversationId, query, audience: "customer" });
  };

  return Object.freeze({
    responder,
    // Customer-initiated handoff belongs to the conversation module contract:
    // SupportHandoffReason has no "customer requested" member and must stay locked.
    requestHandoff: async (workspace: TrustedWorkspaceContext, conversationId: string) => {
      await ensureConversation(workspace, conversationId);
      await requestConversationHandoff(deps.conversations, workspace, conversationId, "customer_requested", now());
    },
  });
}
