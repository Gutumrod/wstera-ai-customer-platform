import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyBusinessActionEvent,
  assertSameWorkspace,
  BusinessActionError,
  isExecutedAfterConfirmation,
  proposeBusinessAction,
  riskOfAction,
} from "./index.js";

const baseProposal = {
  proposalId: "prop-0001",
  workspaceId: "ws-alpha",
  conversationId: "conv-0001",
  idempotencyKey: "idem-000000000001",
  requestedAt: 1_760_000_000_000,
} as const;

function draftOrderRecord() {
  return proposeBusinessAction({
    ...baseProposal,
    kind: "draft_order",
    arguments: { productId: "prod-1", quantity: 2 },
  });
}

test("risk is derived from the action kind, not from caller data", () => {
  assert.equal(riskOfAction("faq_answer"), "read_only");
  assert.equal(riskOfAction("draft_order"), "requires_confirmation");
  const withInjectedRisk: unknown = {
    ...baseProposal,
    kind: "payment_qr_proposal",
    arguments: { amountThb: 100 },
    risk: "read_only",
  };
  const injected = proposeBusinessAction(withInjectedRisk as never);
  assert.equal(injected.risk, "requires_confirmation");
});

test("an unknown action kind is refused instead of defaulting to safe", () => {
  assert.throws(
    () => proposeBusinessAction({ ...baseProposal, kind: "transfer_money" as never, arguments: {} }),
    (error: unknown) => error instanceof BusinessActionError && error.code === "UNKNOWN_ACTION",
  );
});

test("an action that changes state cannot execute before confirmation", () => {
  const authorized = applyBusinessActionEvent(draftOrderRecord(), { kind: "authorize", byUserId: "owner-1" });
  assert.throws(
    () => applyBusinessActionEvent(authorized, { kind: "execute", executionId: "exec-1" }),
    (error: unknown) => error instanceof BusinessActionError && error.code === "EXECUTION_REQUIRES_CONFIRMATION",
  );
});

test("a read-only action may execute after authorization without confirmation", () => {
  const lookup = proposeBusinessAction({ ...baseProposal, kind: "product_lookup", arguments: { query: "serum" } });
  const authorized = applyBusinessActionEvent(lookup, { kind: "authorize", byUserId: "owner-1" });
  const executed = applyBusinessActionEvent(authorized, { kind: "execute", executionId: "exec-1" });
  assert.equal(executed.state, "executed");
  assert.equal(isExecutedAfterConfirmation(executed), true);
});

test("full confirmation cycle reaches verified state", () => {
  const authorized = applyBusinessActionEvent(draftOrderRecord(), { kind: "authorize", byUserId: "owner-1" });
  const confirmed = applyBusinessActionEvent(authorized, {
    kind: "confirm",
    byUserId: "owner-1",
    confirmationId: "conf-1",
  });
  const executed = applyBusinessActionEvent(confirmed, { kind: "execute", executionId: "exec-1" });
  const verified = applyBusinessActionEvent(executed, { kind: "verify", verifiedAt: 1_760_000_100_000 });

  assert.equal(verified.state, "verified");
  assert.equal(verified.confirmationId, "conf-1");
  assert.equal(verified.version, 5);
  assert.equal(isExecutedAfterConfirmation(verified), true);
});

test("re-confirming with the same confirmation id is idempotent", () => {
  const confirmed = applyBusinessActionEvent(draftOrderRecord(), {
    kind: "confirm",
    byUserId: "owner-1",
    confirmationId: "conf-1",
  });
  const again = applyBusinessActionEvent(confirmed, {
    kind: "confirm",
    byUserId: "owner-1",
    confirmationId: "conf-1",
  });
  assert.equal(again, confirmed);
  assert.equal(again.version, confirmed.version);
});

test("confirming twice with a different id is refused", () => {
  const confirmed = applyBusinessActionEvent(draftOrderRecord(), {
    kind: "confirm",
    byUserId: "owner-1",
    confirmationId: "conf-1",
  });
  assert.throws(
    () => applyBusinessActionEvent(confirmed, { kind: "confirm", byUserId: "owner-1", confirmationId: "conf-2" }),
    (error: unknown) => error instanceof BusinessActionError && error.code === "ALREADY_CONFIRMED",
  );
});

test("a record from another workspace is denied", () => {
  assert.throws(
    () => assertSameWorkspace(draftOrderRecord(), "ws-beta"),
    (error: unknown) => error instanceof BusinessActionError && error.code === "CROSS_WORKSPACE_ACTION_DENIED",
  );
  assert.equal(assertSameWorkspace(draftOrderRecord(), "ws-alpha"), undefined);
});

test("terminal records accept no further events", () => {
  const rejected = applyBusinessActionEvent(draftOrderRecord(), { kind: "reject", reason: "customer declined" });
  assert.equal(rejected.state, "rejected");
  assert.throws(
    () => applyBusinessActionEvent(rejected, { kind: "authorize", byUserId: "owner-1" }),
    (error: unknown) => error instanceof BusinessActionError && error.code === "TERMINAL_STATE",
  );
});

test("missing and unexpected arguments are refused", () => {
  assert.throws(
    () => proposeBusinessAction({ ...baseProposal, kind: "draft_order", arguments: { productId: "prod-1" } }),
    (error: unknown) => error instanceof BusinessActionError && error.code === "MISSING_ARGUMENT",
  );
  assert.throws(
    () => proposeBusinessAction({
      ...baseProposal,
      kind: "draft_order",
      arguments: { productId: "prod-1", quantity: 1, chargeNow: true },
    }),
    (error: unknown) => error instanceof BusinessActionError && error.code === "UNEXPECTED_ARGUMENT",
  );
});

test("malformed identifiers and short idempotency keys are refused", () => {
  for (const patch of [
    { proposalId: "" },
    { workspaceId: "ws alpha" },
    { conversationId: "-leading-dash" },
    { idempotencyKey: "short" },
  ]) {
    assert.throws(
      () => proposeBusinessAction({ ...baseProposal, kind: "faq_answer", arguments: { topic: "shipping" }, ...patch }),
      (error: unknown) => error instanceof BusinessActionError && error.code === "INVALID_PROPOSAL",
    );
  }
});
