import type { TrustedWorkspaceContext } from "../../contracts/tenancy/index.js";
import type {
  ConversationEvent,
  ConversationRepositoryPort,
  ConversationSnapshot,
  ConversationStatus,
  HandoffReason,
  StaffAuthorizationPort,
} from "../../contracts/data/conversation.js";

export type {
  ConversationEvent,
  ConversationRepositoryPort,
  ConversationSnapshot,
  ConversationStatus,
  HandoffReason,
  StaffAuthorizationPort,
} from "../../contracts/data/conversation.js";

export type ConversationErrorCode =
  | "INVALID_INPUT"
  | "CONVERSATION_NOT_FOUND"
  | "CONVERSATION_EXISTS"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSITION"
  | "UNAUTHORIZED_OPERATOR";

export class ConversationError extends Error {
  constructor(readonly code: ConversationErrorCode) {
    super(code);
    this.name = "ConversationError";
  }
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

function assertId(value: string): void {
  if (typeof value !== "string" || !idPattern.test(value)) throw new ConversationError("INVALID_INPUT");
}

function assertTime(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new ConversationError("INVALID_INPUT");
}

function withEvent(snapshot: ConversationSnapshot, event: ConversationEvent): ConversationSnapshot {
  assertTime(event.occurredAt);
  if (event.kind === "handoff_requested" && snapshot.status === "ai_active") {
    return Object.freeze({
      ...snapshot,
      status: "handoff_requested",
      handoffReason: event.reason,
      version: snapshot.version + 1,
      updatedAt: event.occurredAt,
    });
  }
  if (event.kind === "operator_claimed" && snapshot.status === "handoff_requested") {
    assertId(event.staffId);
    return Object.freeze({
      ...snapshot,
      status: "human_active",
      assignedStaffId: event.staffId,
      version: snapshot.version + 1,
      updatedAt: event.occurredAt,
    });
  }
  if (event.kind === "staff_reply_delivered" && snapshot.status === "human_active") {
    assertId(event.staffId);
    assertId(event.deliveryId);
    if (snapshot.lastStaffDeliveryId === event.deliveryId) return snapshot;
    return Object.freeze({
      ...snapshot,
      lastStaffDeliveryId: event.deliveryId,
      version: snapshot.version + 1,
      updatedAt: event.occurredAt,
    });
  }
  if (event.kind === "handoff_released" && snapshot.status === "human_active") {
    assertId(event.staffId);
    const { assignedStaffId: _assignedStaffId, handoffReason: _handoffReason, ...rest } = snapshot;
    return Object.freeze({
      ...rest,
      status: "ai_active",
      version: snapshot.version + 1,
      updatedAt: event.occurredAt,
    });
  }
  throw new ConversationError("INVALID_TRANSITION");
}

export function canSendAiReply(conversation: ConversationSnapshot): boolean {
  return conversation.status === "ai_active";
}

export async function createConversation(
  repository: ConversationRepositoryPort,
  workspace: TrustedWorkspaceContext,
  conversationId: string,
  now = new Date().toISOString(),
): Promise<ConversationSnapshot> {
  assertId(conversationId);
  assertTime(now);
  return repository.create(workspace, conversationId, now);
}

export async function requestHandoff(
  repository: ConversationRepositoryPort,
  workspace: TrustedWorkspaceContext,
  conversationId: string,
  reason: HandoffReason,
  now = new Date().toISOString(),
): Promise<ConversationSnapshot> {
  assertId(conversationId);
  if (!("customer_requested" === reason || "no_answer" === reason || "conflicting_evidence" === reason)) {
    throw new ConversationError("INVALID_INPUT");
  }
  assertTime(now);
  const current = await repository.load(workspace, conversationId);
  if (!current) throw new ConversationError("CONVERSATION_NOT_FOUND");
  if (current.status === "handoff_requested" && current.handoffReason === reason) return current;
  return repository.append(workspace, conversationId, current.version, { kind: "handoff_requested", reason, occurredAt: now });
}

export async function claimHandoff(
  repository: ConversationRepositoryPort,
  authorization: StaffAuthorizationPort,
  workspace: TrustedWorkspaceContext,
  conversationId: string,
  staffId: string,
  now = new Date().toISOString(),
): Promise<ConversationSnapshot> {
  assertId(conversationId);
  assertId(staffId);
  assertTime(now);
  const current = await repository.load(workspace, conversationId);
  if (!current) throw new ConversationError("CONVERSATION_NOT_FOUND");
  await authorization.assertCanClaim(workspace, conversationId, staffId);
  if (current.status === "human_active" && current.assignedStaffId === staffId) return current;
  return repository.append(workspace, conversationId, current.version, { kind: "operator_claimed", staffId, occurredAt: now });
}

/** Record this only after the channel adapter confirms the staff reply was delivered. */
export async function recordStaffReplyDelivery(
  repository: ConversationRepositoryPort,
  authorization: StaffAuthorizationPort,
  workspace: TrustedWorkspaceContext,
  conversationId: string,
  staffId: string,
  deliveryId: string,
  now = new Date().toISOString(),
): Promise<ConversationSnapshot> {
  assertId(conversationId);
  assertId(staffId);
  assertId(deliveryId);
  assertTime(now);
  const current = await repository.load(workspace, conversationId);
  if (!current) throw new ConversationError("CONVERSATION_NOT_FOUND");
  await authorization.assertCanReply(workspace, conversationId, staffId);
  return repository.append(workspace, conversationId, current.version, {
    kind: "staff_reply_delivered", staffId, deliveryId, occurredAt: now,
  });
}

export async function releaseHandoff(
  repository: ConversationRepositoryPort,
  authorization: StaffAuthorizationPort,
  workspace: TrustedWorkspaceContext,
  conversationId: string,
  staffId: string,
  now = new Date().toISOString(),
): Promise<ConversationSnapshot> {
  assertId(conversationId);
  assertId(staffId);
  assertTime(now);
  const current = await repository.load(workspace, conversationId);
  if (!current) throw new ConversationError("CONVERSATION_NOT_FOUND");
  await authorization.assertCanRelease(workspace, conversationId, staffId);
  return repository.append(workspace, conversationId, current.version, { kind: "handoff_released", staffId, occurredAt: now });
}

export function applyConversationEvent(snapshot: ConversationSnapshot, event: ConversationEvent): ConversationSnapshot {
  return withEvent(snapshot, event);
}
