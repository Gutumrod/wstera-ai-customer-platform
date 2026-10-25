/**
 * Business action lifecycle reducer (pure).
 *
 * A model may raise a proposal; only backend authorisation, an explicit confirmation and a
 * verified execution may change business state. No executor, payment call, order write or
 * booking write exists in this module: it decides state transitions only.
 *
 * Defence rules encoded here:
 * - Risk is re-derived from `proposal.kind` on every transition; a record whose `risk` field was
 *   tampered with is corrected, never trusted.
 * - Every event carries the workspace it acts in; a mismatch with the proposal's workspace denies.
 * - A state-changing action reaches `executed` only from `confirmed` with a confirmation id.
 * - Confirmation requires prior authorisation; there is no propose -> confirm shortcut.
 *
 * Limitation, deliberately documented: a record is plain data, so a caller that fabricates a fully
 * consistent record (state AND ids) cannot be distinguished from a stored one. Persistence must add
 * integrity (signature or server-side write) before anything executes — see
 * `tasks/TASK-P3A-BUSINESS-ACTION-EXECUTOR.md`.
 */

import type {
  BusinessActionArgumentValue,
  BusinessActionEvent,
  BusinessActionKind,
  BusinessActionProposal,
  BusinessActionRecord,
  BusinessActionRisk,
} from "../../contracts/business-actions/index.js";

export type BusinessActionErrorCode =
  | "UNKNOWN_ACTION"
  | "INVALID_PROPOSAL"
  | "MISSING_ARGUMENT"
  | "UNEXPECTED_ARGUMENT"
  | "EXECUTION_REQUIRES_CONFIRMATION"
  | "ALREADY_CONFIRMED"
  | "INVALID_TRANSITION"
  | "TERMINAL_STATE"
  | "CROSS_WORKSPACE_ACTION_DENIED";

export class BusinessActionError extends Error {
  constructor(readonly code: BusinessActionErrorCode) {
    super(code);
    this.name = "BusinessActionError";
  }
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

const RISK_BY_KIND = new Map<BusinessActionKind, BusinessActionRisk>([
  ["product_lookup", "read_only"],
  ["faq_answer", "read_only"],
  ["availability_check", "read_only"],
  ["draft_order", "requires_confirmation"],
  ["payment_qr_proposal", "requires_confirmation"],
]);

const REQUIRED_ARGUMENTS = new Map<BusinessActionKind, readonly string[]>([
  ["product_lookup", ["query"]],
  ["faq_answer", ["topic"]],
  ["availability_check", ["serviceId", "targetDate"]],
  ["draft_order", ["productId", "quantity"]],
  ["payment_qr_proposal", ["amountThb"]],
]);

const TERMINAL_STATES: ReadonlySet<string> = new Set(["verified", "rejected"]);

/** Risk of an action kind. Unknown kinds throw instead of defaulting to a safe-looking value. */
export function riskOfAction(kind: BusinessActionKind): BusinessActionRisk {
  const risk = RISK_BY_KIND.get(kind);
  if (risk === undefined) throw new BusinessActionError("UNKNOWN_ACTION");
  return risk;
}

export type BusinessActionProposalInput = Readonly<{
  proposalId: string;
  workspaceId: string;
  conversationId: string;
  kind: BusinessActionKind;
  arguments: Readonly<Record<string, BusinessActionArgumentValue>>;
  idempotencyKey: string;
  requestedAt: number;
}>;

/**
 * Validate a raw proposal and freeze it as a `proposed` record.
 * A risk field supplied by the caller is ignored: risk always comes from the kind.
 */
export function proposeBusinessAction(input: BusinessActionProposalInput): BusinessActionRecord {
  if (!ID_PATTERN.test(input.proposalId) || !ID_PATTERN.test(input.workspaceId) || !ID_PATTERN.test(input.conversationId)) {
    throw new BusinessActionError("INVALID_PROPOSAL");
  }
  if (input.idempotencyKey.length < 12 || input.idempotencyKey.length > 128) {
    throw new BusinessActionError("INVALID_PROPOSAL");
  }
  if (!Number.isFinite(input.requestedAt)) throw new BusinessActionError("INVALID_PROPOSAL");

  const risk = riskOfAction(input.kind);
  const allowed = REQUIRED_ARGUMENTS.get(input.kind) ?? [];
  for (const name of allowed) {
    if (!Object.prototype.hasOwnProperty.call(input.arguments, name)) throw new BusinessActionError("MISSING_ARGUMENT");
  }
  for (const [name, value] of Object.entries(input.arguments)) {
    if (!allowed.includes(name)) throw new BusinessActionError("UNEXPECTED_ARGUMENT");
    const type = typeof value;
    if (type !== "string" && type !== "number" && type !== "boolean") throw new BusinessActionError("INVALID_PROPOSAL");
    if (type === "number" && !Number.isFinite(value as number)) throw new BusinessActionError("INVALID_PROPOSAL");
  }

  const proposal: BusinessActionProposal = Object.freeze({
    proposalId: input.proposalId,
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    kind: input.kind,
    arguments: Object.freeze({ ...input.arguments }),
    idempotencyKey: input.idempotencyKey,
    requestedAt: input.requestedAt,
  });

  return Object.freeze({ proposal, risk, state: "proposed" as const, version: 1 });
}

/** Deny acting on a record that belongs to another workspace. */
export function assertSameWorkspace(record: BusinessActionRecord, workspaceId: string): void {
  if (record.proposal.workspaceId !== workspaceId) throw new BusinessActionError("CROSS_WORKSPACE_ACTION_DENIED");
}

/**
 * Apply one lifecycle event. Pure: returns a new frozen record and never touches I/O.
 * Re-confirming with the same confirmation id from a confirmed record is idempotent.
 */
export function applyBusinessActionEvent(
  record: BusinessActionRecord,
  event: BusinessActionEvent,
): BusinessActionRecord {
  if (TERMINAL_STATES.has(record.state)) throw new BusinessActionError("TERMINAL_STATE");
  assertSameWorkspace(record, event.workspaceId);

  // Never trust a risk field that travelled with the record.
  const risk = riskOfAction(record.proposal.kind);

  const advance = (patch: Partial<BusinessActionRecord>): BusinessActionRecord =>
    Object.freeze({ ...record, risk, ...patch, version: record.version + 1 });

  switch (event.kind) {
    case "authorize":
      if (record.state !== "proposed") throw new BusinessActionError("INVALID_TRANSITION");
      if (event.byUserId.length === 0) throw new BusinessActionError("INVALID_TRANSITION");
      return advance({ state: "authorized", authorizedByUserId: event.byUserId });

    case "confirm":
      if (record.state === "confirmed") {
        if (record.confirmationId === event.confirmationId) return Object.freeze({ ...record, risk });
        throw new BusinessActionError("ALREADY_CONFIRMED");
      }
      if (record.state !== "authorized") throw new BusinessActionError("INVALID_TRANSITION");
      if (event.confirmationId.length === 0 || event.byUserId.length === 0) {
        throw new BusinessActionError("INVALID_TRANSITION");
      }
      return advance({ state: "confirmed", confirmationId: event.confirmationId, confirmedByUserId: event.byUserId });

    case "execute":
      if (record.state !== "confirmed" || record.confirmationId === undefined) {
        if (risk === "requires_confirmation") throw new BusinessActionError("EXECUTION_REQUIRES_CONFIRMATION");
        if (record.state !== "authorized") throw new BusinessActionError("INVALID_TRANSITION");
      }
      if (event.executionId.length === 0) throw new BusinessActionError("INVALID_TRANSITION");
      return advance({ state: "executed", executionId: event.executionId });

    case "verify":
      if (record.state !== "executed") throw new BusinessActionError("INVALID_TRANSITION");
      if (!Number.isFinite(event.verifiedAt)) throw new BusinessActionError("INVALID_TRANSITION");
      return advance({ state: "verified", verifiedAt: event.verifiedAt });

    case "reject":
      if (record.state !== "proposed" && record.state !== "authorized" && record.state !== "confirmed") {
        throw new BusinessActionError("INVALID_TRANSITION");
      }
      if (event.reason.length === 0) throw new BusinessActionError("INVALID_TRANSITION");
      return advance({ state: "rejected", rejectionReason: event.reason });

    case "fail":
      if (record.state !== "proposed" && record.state !== "authorized" && record.state !== "confirmed") {
        throw new BusinessActionError("INVALID_TRANSITION");
      }
      if (event.code.length === 0) throw new BusinessActionError("INVALID_TRANSITION");
      return advance({ state: "failed", failureCode: event.code });

    default:
      throw new BusinessActionError("INVALID_TRANSITION");
  }
}

/** True only for a record that executed after a real confirmation (or was read-only). */
export function isExecutedAfterConfirmation(record: BusinessActionRecord): boolean {
  if (record.state !== "executed" && record.state !== "verified") return false;
  const risk = riskOfAction(record.proposal.kind);
  return risk === "read_only" || record.confirmationId !== undefined;
}
