import type { ConversationRepositoryPort } from "../contracts/data/conversation.js";
import type { ConversationMessagePort } from "../contracts/data/conversation-messages.js";
import type { KnowledgeRetrievalPort } from "../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import type {
  AnswerabilityPort,
  EvidenceFreshnessPort,
  GroundedAnswerPort,
  SupportEvidence,
  SupportHandoffPort,
} from "../modules/ai-engine/support-orchestrator.js";
import { requestHandoff as requestConversationHandoff } from "../modules/conversation/index.js";
import { createAnswerBrain } from "./answer-brain.js";
import type { SupportResponder } from "./web-chat-routes.js";

/** Everything the Web Chat host may touch. Workspace, connection, conversation
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

export function createWebChatHost(deps: WebChatHostDeps): WebChatHost {
  const brain = createAnswerBrain(deps);
  // The responder ignores the caller-supplied audience and always answers as "customer".
  const responder: SupportResponder = ({ workspace, conversationId, query }) =>
    brain.respond({ workspace, conversationId, query });

  return Object.freeze({
    responder,
    // Customer handoff is intentionally left to a real channel/operator adapter.
    requestHandoff: async (workspace: TrustedWorkspaceContext, conversationId: string) => {
      await brain.ensureConversation(workspace, conversationId);
      await requestConversationHandoff(deps.conversations, workspace, conversationId, "customer_requested", deps.now?.() ?? new Date().toISOString());
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
