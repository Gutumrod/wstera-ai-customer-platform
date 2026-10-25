# Payments (module)

**Status:** pure payload builder only. Not wired to any route, UI, adapter or payment flow.

## Responsibility

Build a PromptPay EMVCo QR payload string from a target and optional amount (`index.ts`).
Pure TypeScript: no I/O, no network, no dependencies, no state.

## What this does NOT do

- No charge, refund, confirmation or verification against any bank or provider.
- No persistence of targets, amounts or orders.
- No authorisation: callers must not treat a generated payload as a confirmed payment.
- **Not proven with a real banking app.** The CRC and TLV structure are covered by local tests
  only; scanning a generated QR with an actual bank app has never been run.

`BUILD_PASS != LIVE_PROVEN`. Do not claim this module can collect money until a real scan and a
real settlement are evidenced, and until an authorised, confirmed business-action path exists
(see `platform/contracts/business-actions/`).
