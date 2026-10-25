# Task P4 — PromptPay wiring and real-scan proof (PLANNED)

**Status:** PLANNED. Not authorised to start. The module exists as a pure builder only.

## Goal

Prove a generated payload is usable before anything relies on it, then wire it to a storefront
payment path that is authorised and confirmed.

## Scope (proposed)

1. **Real-scan proof first.** Scan one generated QR with a real Thai banking app against the Owner's
   own PromptPay target for a negligible amount, capture the app's confirmation screen as evidence,
   and record it. Until this exists, the module stays `BUILD_PASS` only.
2. Second independent check of the CRC against a published EMVCo/PromptPay reference vector, or a QR
   decoded by a second implementation.
3. Only then: a caller that builds the payload inside a `payment_qr_proposal` business action, after
   confirmation, with an audit record.

## Acceptance (proposed)

- Scan evidence attached (screenshot plus amount, date, app).
- A QR cannot be issued for an unconfirmed or cross-workspace action.
- Amount is never taken from model text without the stored, authorised value.

## Out of scope

Card payments, Stripe, refunds, settlement reconciliation, any production deploy.
