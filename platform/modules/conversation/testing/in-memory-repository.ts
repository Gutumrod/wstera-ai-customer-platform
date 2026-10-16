import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";
import type { ConversationEvent, ConversationRepositoryPort, ConversationSnapshot } from "../../../contracts/data/conversation.js";
import {
  applyConversationEvent,
  ConversationError,
} from "../index.js";

const key = (workspaceId: string, conversationId: string): string => `${workspaceId}\u0000${conversationId}`;

export class InMemoryConversationRepository implements ConversationRepositoryPort {
  private readonly conversations = new Map<string, ConversationSnapshot>();

  async create(workspace: TrustedWorkspaceContext, conversationId: string, now = new Date().toISOString()): Promise<ConversationSnapshot> {
    const id = key(workspace.workspaceId, conversationId);
    if (this.conversations.has(id)) throw new ConversationError("CONVERSATION_EXISTS");
    const conversation = Object.freeze({
      workspaceId: workspace.workspaceId,
      conversationId,
      status: "ai_active" as const,
      version: 0,
      createdAt: now,
      updatedAt: now,
    });
    this.conversations.set(id, conversation);
    return conversation;
  }

  async load(workspace: TrustedWorkspaceContext, conversationId: string): Promise<ConversationSnapshot | null> {
    return this.conversations.get(key(workspace.workspaceId, conversationId)) ?? null;
  }

  async append(
    workspace: TrustedWorkspaceContext,
    conversationId: string,
    expectedVersion: number,
    event: ConversationEvent,
  ): Promise<ConversationSnapshot> {
    const id = key(workspace.workspaceId, conversationId);
    const current = this.conversations.get(id);
    if (!current) throw new ConversationError("CONVERSATION_NOT_FOUND");
    if (current.version !== expectedVersion) throw new ConversationError("VERSION_CONFLICT");
    const next = applyConversationEvent(current, event);
    this.conversations.set(id, next);
    return next;
  }
}
