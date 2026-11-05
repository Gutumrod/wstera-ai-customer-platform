import type { TrustedWorkspaceContext } from "../tenancy/index.js";

export type StaffConversationMessage = Readonly<{ id: string; text: string; createdAt: string }>;

/** Separate from ConversationRepositoryPort so its existing methods stay stable. */
export interface ConversationMessagePort {
  appendTurn(input: Readonly<{ workspace: TrustedWorkspaceContext; conversationId: string; customerText: string; botText: string }>): Promise<void>;
  staffUpdates(input: Readonly<{ workspace: TrustedWorkspaceContext; conversationId: string; after: string | null; limit: number }>): Promise<Readonly<{ messages: readonly StaffConversationMessage[]; cursor: string | null }>>;
}
