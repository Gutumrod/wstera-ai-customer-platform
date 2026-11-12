import type { TrustedWorkspaceContext } from "../tenancy/index.js";

export type StaffConversationMessage = Readonly<{ id: string; text: string; createdAt: string }>;

/** Separate from ConversationRepositoryPort so its existing methods stay stable. */
export type RecentTurn = Readonly<{ role: "customer" | "assistant"; text: string }>;

export interface ConversationMessagePort {
  /** Latest customer/bot messages of a conversation, oldest first. Optional: channels without stored turns simply omit it. */
  recentTurns?(input: Readonly<{ workspace: TrustedWorkspaceContext; conversationId: string; limit: number }>): Promise<readonly RecentTurn[]>;
  appendTurn(input: Readonly<{ workspace: TrustedWorkspaceContext; conversationId: string; customerText: string; botText: string }>): Promise<void>;
  staffUpdates(input: Readonly<{ workspace: TrustedWorkspaceContext; conversationId: string; after: string | null; limit: number }>): Promise<Readonly<{ messages: readonly StaffConversationMessage[]; cursor: string | null }>>;
}
