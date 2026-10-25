/**
 * Business action lifecycle reducer (pure).
 *
 * A model may raise a proposal; only backend authorisation, an explicit confirmation and a
 * verified execution may change business state. No executor, payment call, order write or
 * booking write exists in this module: it decides state transitions only.
 *
 * Risk is derived from the action kind here, never from caller- or model-supplied data.
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

const RISK_BY_KIND: Readonly<Record<BusinessActionKind, BusinessActionRisk>> = {
  product_lookup: "read_only",
  faq_answer: "read_only",
  availability_check: "read_only",
  draft_order: "requires_confirmation",
  payment_qr_proposal: "requires_confirmation",
};

const REQUIRED_ARGUMENTS: Readonly<Record<BusinessActionKind, readonly string[]>> = {
  product_lookup: ["query"],
  faq_answer: ["topic"],
  availability_check: ["serviceId", "targetDate"],
  draft_order: ["productId", "quantity"],
  payment_qr_proposal: ["amountThb"],
};

const TERMINAL_STATES: readonly string[] = ["verified", "rejected"];

/** Risk of an action kind. Unknown kinds throw instead of defaulting to a safe-looking value. */
export function riskOfAction(kind: BusinessActionKind): BusinessActionRisk {
  const risk = RISK_BY_KIND[kind];
  if (!risk) throw new BusinessActionError("UNKNOWN_ACTION");
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
  const allowed = REQUIRED_ARGUMENTS[input.kind];
  for (const name of allowed) {
    if (!Object.prototype.hasOwnProperty.call(input.arguments, name)) throw new BusinessActionError("MISSING_ARGUMENT");
  }
  for (const name of Object.keys(input.arguments)) {
    if (!allowed.includes(name)) throw new BusinessActionError("UNEXPECTED_ARGUMENT");
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
 * Re-confirming with the same confirmation id is idempotent and returns the same record.
 */
export function applyBusinessActionEvent(
  record: BusinessActionRecord,
  event: BusinessActionEvent,
): BusinessActionRecord {
  if (TERMINAL_STATES.includes(record.state)) throw new BusinessActionError("TERMINAL_STATE");

  const advance = (patch: Partial<BusinessActionRecord>): BusinessActionRecord =>
    Object.freeze({ ...record, ...patch, version: record.version + 1 });

  switch (event.kind) {
    case "authorize":
      if (record.state !== "proposed") throw new BusinessActionError("INVALID_TRANSITION");
      if (event.byUserId.length === 0) throw new BusinessActionError("INVALID_TRANSITION");
      return advance({ state: "authorized", authorizedByUserId: event.byUserId });

    case "confirm":
      if (record.state === "confirmed") {
        if (record.confirmationId === event.confirmationId) return record;
        throw new BusinessActionError("ALREADY_CONFIRMED");
      }
      if (record.state !== "authorized" && record.state !== "proposed") {
        throw new BusinessActionError("INVALID_TRANSITION");
      }
      if (event.confirmationId.length === 0 || event.byUserId.length === 0) {
        throw new BusinessActionError("INVALID_TRANSITION");
      }
      return advance({ state: "confirmed", confirmationId: event.confirmationId, confirmedByUserId: event.byUserId });

    case "execute": {
      if (record.risk === "requires_confirmation" && record.state !== "confirmed") {
        throw new BusinessActionError("EXECUTION_REQUIRES_CONFIRMATION");
      }
      if (record.state !== "confirmed" && record.state !== "authorized") {
        throw new BusinessActionError("INVALID_TRANSITION");
      }
      if (event.executionId.length === 0) throw new BusinessActionError("INVALID_TRANSITION");
      return advance({ state: "executed", executionId: event.executionId });
    }

    case "verify":
      if (record.state !== "executed") throw new BusinessActionError("INVALID_TRANSITION");
      if (!Number.isFinite(event.verifiedAt)) throw new BusinessActionError("INVALID_TRANSITION");
      return advance({ state: "verified", verifiedAt: event.verifiedAt });

    case "reject":
      if (event.reason.length === 0) throw new BusinessActionError("INVALID_TRANSITION");
      return advance({ state: "rejected", rejectionReason: event.reason });

    case "fail":
      if (event.code.length === 0) throw new BusinessActionError("INVALID_TRANSITION");
      return advance({ state: "failed", failureCode: event.code });

    default:
      throw new BusinessActionError("INVALID_TRANSITION");
  }
}

/** True only for a record that passed confirmation (or was read-only) and executed. */
export function isExecutedAfterConfirmation(record: BusinessActionRecord): boolean {
  if (record.state !== "executed" && record.state !== "verified") return false;
  return record.risk === "read_only" || record.confirmationId !== undefined;
}
