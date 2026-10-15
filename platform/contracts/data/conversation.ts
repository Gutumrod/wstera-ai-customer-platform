import type { TrustedWorkspaceContext } from "../tenancy/index.js";

export type ConversationStatus = "ai_active" | "handoff_requested" | "human_active";
export type HandoffReason = "customer_requested" | "no_answer" | "conflicting_evidence";

export type ConversationSnapshot = Readonly<{
  workspaceId: string;
  conversationId: string;
  status: ConversationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  handoffReason?: HandoffReason;
  assignedStaffId?: string;
  lastStaffDeliveryId?: string;
}>;

export type ConversationEvent =
  | Readonly<{ kind: "handoff_requested"; reason: HandoffReason; occurredAt: string }>
  | Readonly<{ kind: "operator_claimed"; staffId: string; occurredAt: string }>
  | Readonly<{ kind: "staff_reply_delivered"; staffId: string; deliveryId: string; occurredAt: string }>
  | Readonly<{ kind: "handoff_released"; staffId: string; occurredAt: string }>;

/** append must atomically compare expectedVersion and persist the state transition. */
export interface ConversationRepositoryPort {
  create(workspace: TrustedWorkspaceContext, conversationId: string, now?: string): Promise<ConversationSnapshot>;
  load(workspace: TrustedWorkspaceContext, conversationId: string): Promise<ConversationSnapshot | null>;
  append(
    workspace: TrustedWorkspaceContext,
    conversationId: string,
    expectedVersion: number,
    event: ConversationEvent,
  ): Promise<ConversationSnapshot>;
}

/** Resolve staff membership and role from authenticated server identity and workspace data. */
export interface StaffAuthorizationPort {
  assertCanClaim(workspace: TrustedWorkspaceContext, conversationId: string, staffId: string): Promise<void>;
  assertCanReply(workspace: TrustedWorkspaceContext, conversationId: string, staffId: string): Promise<void>;
  assertCanRelease(workspace: TrustedWorkspaceContext, conversationId: string, staffId: string): Promise<void>;
}
