# Work Queue

Updated: 2026-10-25 against `main` at `9b4f997`. Merged code and product acceptance are tracked separately.

## Done on main

- Task 001 foundation/security boundary (PR #2), retained from the initial baseline.
- PR #16 consolidated and merged prior PRs #4–#15 at `857b2e5`; former heads remain preserved in Git ancestry.
- Included slices: Phase 0C tenancy/channel boundary, synthetic knowledge lifecycle and retrieval, bounded local PDF/CSV extraction, retrieval evaluation/SKU normalization, local conversation/handoff core, citation validation, response orchestration, mocked-transport model adapter, and PostgreSQL knowledge persistence with PGlite coverage.
- PR #18 merged the local-only authenticated knowledge host (staff auth, server-resolved workspace, private synthetic PDF/CSV upload, review/approval and citation search). Its Docker-backed browser-to-local-Supabase E2E remains open.
- PR #19 merged a pure PromptPay payload builder; no real bank-app QR scan or payment wiring.
- PR #20 merged typed business-action contracts and lifecycle reducer; no executor or business writes.
- PR #21 merged source-import provenance and pilot-gate documents.

## Current G1 work

| Work | Current state | Next evidence needed |
|---|---|---|
| Authenticated host/bootstrap | Implemented and merged in PR #18; local-only synthetic scope | Docker-backed authenticated Supabase E2E; route-level tests/rate limiting; resolve membership-revalidation race; independent review of remaining delta |
| Knowledge upload and approval | Local-only upload, review/approval and citation search merged | Verify browser-to-local-Supabase flow and exact citations; no hosted setup implied |
| Web Chat | No visitor chat UI/session host | Allowed-origin/session binding, shared-engine answer, citation and abuse-limit tests |
| Durable handoff | Local state/ports only | Persistent staff authorization, durable pause/resume and atomic dispatch/outbox guard |
| Live model and usage | Adapter tested with mocked transport; no provider selected | Owner-approved provider, data region and budget; durable usage ledger and measured answer quality |
| G1 acceptance | No one-shop end-to-end run | Browser trace from upload through grounded answer and authorized human takeover; negative tenant cases and independent security review |
| Business actions | PR #20 contract and pure reducer merged; no executor | Keep P3A planned until separately approved and scoped |
| PromptPay | PR #19 pure payload builder merged; not wired to payments | Real bank-app scan and independent vector evidence before any separately approved wiring task |

G2 real LINE sandbox follows G1. G3 onboarding and G4 commercial validation remain gated. Do not deploy, run hosted migrations, or incur provider spend without separate Owner approval.
