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

const WS = "ws-alpha";
const baseProposal = {
  proposalId: "prop-0001",
  workspaceId: WS,
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

const expectCode = (code: string) => (error: unknown) =>
  error instanceof BusinessActionError && error.code === code;

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

test("an unknown or inherited property name is refused instead of resolving", () => {
  for (const kind of ["transfer_money", "toString", "constructor", "__proto__"]) {
    assert.throws(
      () => proposeBusinessAction({ ...baseProposal, kind: kind as never, arguments: {} }),
      expectCode("UNKNOWN_ACTION"),
    );
  }
});

test("a tampered risk field on the record cannot unlock execution", () => {
  const authorized = applyBusinessActionEvent(draftOrderRecord(), { kind: "authorize", workspaceId: WS, byUserId: "owner-1" });
  const forged = { ...authorized, risk: "read_only" } as typeof authorized;
  assert.throws(
    () => applyBusinessActionEvent(forged, { kind: "execute", workspaceId: WS, executionId: "exec-1" }),
    expectCode("EXECUTION_REQUIRES_CONFIRMATION"),
  );
});

test("an action that changes state cannot execute before confirmation", () => {
  const authorized = applyBusinessActionEvent(draftOrderRecord(), { kind: "authorize", workspaceId: WS, byUserId: "owner-1" });
  assert.throws(
    () => applyBusinessActionEvent(authorized, { kind: "execute", workspaceId: WS, executionId: "exec-1" }),
    expectCode("EXECUTION_REQUIRES_CONFIRMATION"),
  );
});

test("confirmation cannot skip authorisation", () => {
  assert.throws(
    () => applyBusinessActionEvent(draftOrderRecord(), {
      kind: "confirm",
      workspaceId: WS,
      byUserId: "owner-1",
      confirmationId: "conf-1",
    }),
    expectCode("INVALID_TRANSITION"),
  );
});

test("a read-only action may execute after authorization without confirmation", () => {
  const lookup = proposeBusinessAction({ ...baseProposal, kind: "product_lookup", arguments: { query: "serum" } });
  const authorized = applyBusinessActionEvent(lookup, { kind: "authorize", workspaceId: WS, byUserId: "owner-1" });
  const executed = applyBusinessActionEvent(authorized, { kind: "execute", workspaceId: WS, executionId: "exec-1" });
  assert.equal(executed.state, "executed");
  assert.equal(isExecutedAfterConfirmation(executed), true);
});

test("full confirmation cycle reaches verified state", () => {
  const authorized = applyBusinessActionEvent(draftOrderRecord(), { kind: "authorize", workspaceId: WS, byUserId: "owner-1" });
  const confirmed = applyBusinessActionEvent(authorized, {
    kind: "confirm",
    workspaceId: WS,
    byUserId: "owner-1",
    confirmationId: "conf-1",
  });
  const executed = applyBusinessActionEvent(confirmed, { kind: "execute", workspaceId: WS, executionId: "exec-1" });
  const verified = applyBusinessActionEvent(executed, { kind: "verify", workspaceId: WS, verifiedAt: 1_760_000_100_000 });

  assert.equal(verified.state, "verified");
  assert.equal(verified.confirmationId, "conf-1");
  assert.equal(verified.version, 5);
  assert.equal(verified.risk, "requires_confirmation");
  assert.equal(isExecutedAfterConfirmation(verified), true);
});

test("re-confirming with the same confirmation id is idempotent", () => {
  const confirmed = applyBusinessActionEvent(
    applyBusinessActionEvent(draftOrderRecord(), { kind: "authorize", workspaceId: WS, byUserId: "owner-1" }),
    { kind: "confirm", workspaceId: WS, byUserId: "owner-1", confirmationId: "conf-1" },
  );
  const again = applyBusinessActionEvent(confirmed, {
    kind: "confirm",
    workspaceId: WS,
    byUserId: "owner-1",
    confirmationId: "conf-1",
  });
  assert.equal(again.version, confirmed.version);
  assert.equal(again.state, "confirmed");
});

test("confirming twice with a different id is refused", () => {
  const confirmed = applyBusinessActionEvent(
    applyBusinessActionEvent(draftOrderRecord(), { kind: "authorize", workspaceId: WS, byUserId: "owner-1" }),
    { kind: "confirm", workspaceId: WS, byUserId: "owner-1", confirmationId: "conf-1" },
  );
  assert.throws(
    () => applyBusinessActionEvent(confirmed, { kind: "confirm", workspaceId: WS, byUserId: "owner-1", confirmationId: "conf-2" }),
    expectCode("ALREADY_CONFIRMED"),
  );
});

test("any event naming another workspace is denied", () => {
  assert.throws(
    () => applyBusinessActionEvent(draftOrderRecord(), { kind: "authorize", workspaceId: "ws-beta", byUserId: "owner-1" }),
    expectCode("CROSS_WORKSPACE_ACTION_DENIED"),
  );
  assert.throws(() => assertSameWorkspace(draftOrderRecord(), "ws-beta"), expectCode("CROSS_WORKSPACE_ACTION_DENIED"));
  assert.equal(assertSameWorkspace(draftOrderRecord(), WS), undefined);
});

test("terminal records accept no further events", () => {
  const rejected = applyBusinessActionEvent(draftOrderRecord(), { kind: "reject", workspaceId: WS, reason: "customer declined" });
  assert.equal(rejected.state, "rejected");
  assert.throws(
    () => applyBusinessActionEvent(rejected, { kind: "authorize", workspaceId: WS, byUserId: "owner-1" }),
    expectCode("TERMINAL_STATE"),
  );
});

test("an executed record cannot be rejected or failed afterwards", () => {
  const lookup = proposeBusinessAction({ ...baseProposal, kind: "faq_answer", arguments: { topic: "shipping" } });
  const authorized = applyBusinessActionEvent(lookup, { kind: "authorize", workspaceId: WS, byUserId: "owner-1" });
  const executed = applyBusinessActionEvent(authorized, { kind: "execute", workspaceId: WS, executionId: "exec-1" });
  assert.throws(
    () => applyBusinessActionEvent(executed, { kind: "reject", workspaceId: WS, reason: "late" }),
    expectCode("INVALID_TRANSITION"),
  );
  assert.throws(
    () => applyBusinessActionEvent(executed, { kind: "fail", workspaceId: WS, code: "LATE" }),
    expectCode("INVALID_TRANSITION"),
  );
});

test("missing, unexpected or non-scalar arguments are refused", () => {
  assert.throws(
    () => proposeBusinessAction({ ...baseProposal, kind: "draft_order", arguments: { productId: "prod-1" } }),
    expectCode("MISSING_ARGUMENT"),
  );
  assert.throws(
    () => proposeBusinessAction({
      ...baseProposal,
      kind: "draft_order",
      arguments: { productId: "prod-1", quantity: 1, chargeNow: true },
    }),
    expectCode("UNEXPECTED_ARGUMENT"),
  );
  const nested: unknown = { ...baseProposal, kind: "draft_order", arguments: { productId: { a: 1 }, quantity: 1 } };
  assert.throws(() => proposeBusinessAction(nested as never), expectCode("INVALID_PROPOSAL"));
});

test("argument values are copied, not shared with the caller", () => {
  const args = { productId: "prod-1", quantity: 2 };
  const record = proposeBusinessAction({ ...baseProposal, kind: "draft_order", arguments: args });
  args.quantity = 99;
  assert.equal(record.proposal.arguments.quantity, 2);
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
      expectCode("INVALID_PROPOSAL"),
    );
  }
});
