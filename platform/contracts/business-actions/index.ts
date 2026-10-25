/**
 * Business action contracts: typed proposals that a model may raise but never authorise.
 *
 * Cycle (AGENTS.md): Validate -> Authorize -> Confirm -> Idempotent Execute -> Verify -> Audit.
 * This folder holds DTOs and ports only. The pure lifecycle reducer lives in
 * `platform/modules/business-actions/`; no executor, payment, order or booking write exists yet.
 *
 * Safety invariant: nothing here accepts a risk level, an approval or a confirmation that
 * originated in model text. Risk is derived from the action kind by the domain module.
 */

/** Actions the assistant may raise. Read-only kinds never change business state. */
export type BusinessActionKind =
  | "product_lookup"
  | "faq_answer"
  | "availability_check"
  | "draft_order"
  | "payment_qr_proposal";

export type BusinessActionRisk = "read_only" | "requires_confirmation";

export type BusinessActionState =
  | "proposed"
  | "authorized"
  | "confirmed"
  | "executed"
  | "verified"
  | "rejected"
  | "failed";

export type BusinessActionArgumentValue = string | number | boolean;

/** A proposal is data, not permission. It carries no risk field on purpose. */
export type BusinessActionProposal = Readonly<{
  proposalId: string;
  workspaceId: string;
  conversationId: string;
  kind: BusinessActionKind;
  arguments: Readonly<Record<string, BusinessActionArgumentValue>>;
  idempotencyKey: string;
  requestedAt: number;
}>;

export type BusinessActionRecord = Readonly<{
  proposal: BusinessActionProposal;
  risk: BusinessActionRisk;
  state: BusinessActionState;
  version: number;
  authorizedByUserId?: string;
  confirmationId?: string;
  confirmedByUserId?: string;
  executionId?: string;
  verifiedAt?: number;
  failureCode?: string;
  rejectionReason?: string;
}>;

/** Every event names the workspace it acts in; the reducer denies a mismatch. */
export type BusinessActionEvent =
  | Readonly<{ kind: "authorize"; workspaceId: string; byUserId: string }>
  | Readonly<{ kind: "confirm"; workspaceId: string; byUserId: string; confirmationId: string }>
  | Readonly<{ kind: "execute"; workspaceId: string; executionId: string }>
  | Readonly<{ kind: "verify"; workspaceId: string; verifiedAt: number }>
  | Readonly<{ kind: "reject"; workspaceId: string; reason: string }>
  | Readonly<{ kind: "fail"; workspaceId: string; code: string }>;

/** Backend permission check. The only authority that may advance a proposal. */
export type BusinessActionAuthorizationPort = Readonly<{
  assertCanAuthorize(input: Readonly<{ workspaceId: string; userId: string; kind: BusinessActionKind }>): Promise<void>;
}>;

/** Side-effect boundary. Called only from a confirmed (or read-only) record. */
export type BusinessActionExecutorPort = Readonly<{
  execute(record: BusinessActionRecord): Promise<Readonly<{ executionId: string }>>;
}>;

export type BusinessActionAuditPort = Readonly<{
  record(record: BusinessActionRecord, event: BusinessActionEvent): Promise<void>;
}>;
