# Work Queue

Updated: 2026-11-03 against `main` at `7de2649`. Merged code and product acceptance are tracked separately.

## Done on main

- Task 001 foundation/security boundary (PR #2), retained from the initial baseline.
- PR #16 consolidated and merged prior PRs #4–#15 at `857b2e5`; former heads remain preserved in Git ancestry.
- Included slices: Phase 0C tenancy/channel boundary, synthetic knowledge lifecycle and retrieval, bounded local PDF/CSV extraction, retrieval evaluation/SKU normalization, local conversation/handoff core, citation validation, response orchestration, mocked-transport model adapter, and PostgreSQL knowledge persistence with PGlite coverage.
- PR #18 merged the local-only authenticated knowledge host (staff auth, server-resolved workspace, private synthetic PDF/CSV upload, review/approval and citation search). Its browser-to-Supabase E2E remains open.
- PR #19 merged a pure PromptPay payload builder; no real bank-app QR scan or payment wiring.
- PR #20 merged typed business-action contracts and lifecycle reducer; no executor or business writes.
- PR #21 merged source-import provenance and pilot-gate documents.
- PR #24 merged Merchant Brain discovery documents only; no code change.
- 2026-11-02: PR #22 (docs sync), PR #23 (schema `aicp` isolation), PR #25 (HOST-004 lab mode) and PR #26 (HOST-002 hardening, 216 tests) merged. None of it has run against a real Supabase project.

## Current G1 work

| Work | Current state | Next evidence needed |
|---|---|---|
| Authenticated host/bootstrap | Merged: PR #18 host, PR #23 schema isolation, PR #25 lab mode, PR #26 hardening (route tests, rate limit, revalidation, M1–M3 closed in code). Docker withdrawn by `D-20261025-11` | Owner GO 2026-11-03 to apply migrations and seed synthetic data to a separate disposable Supabase test project (replaces `wstera-lab` as the E2E target); not applied yet. Then the browser E2E and an independent review of PR #26 |
| Knowledge upload and approval | Local-only upload, review/approval and citation search merged | Verify browser-to-`wstera-lab` flow and exact citations; no hosted setup implied |
| Web Chat | No visitor chat UI/session host | Allowed-origin/session binding, shared-engine extractive cited answer (model flag off), citation and abuse-limit tests |
| Durable handoff | Local state/ports only | Persistent staff authorization, durable pause/resume and atomic dispatch/outbox guard |
| Live model and usage | Adapter tested with mocked transport; no provider selected | Owner-approved provider, data region and budget; durable usage ledger and measured answer quality |
| G1 acceptance | No one-shop end-to-end run | Browser trace from upload through grounded answer and authorized human takeover; negative tenant cases and independent security review |
| Business actions | PR #20 contract and pure reducer merged; no executor | Keep P3A planned until separately approved and scoped |
| PromptPay | PR #19 pure payload builder merged; not wired to payments | Real bank-app scan and independent vector evidence before any separately approved wiring task |

LINE offline track (Owner 2026-11-03): adapter and host against a fake transport may proceed in parallel with G1 once Core Contract v0.1 is locked; durable handoff integration waits for HANDOFF-002. G2 real LINE sandbox follows G1. G3 onboarding and G4 commercial validation remain gated. Do not deploy, run hosted migrations, or incur provider spend without separate Owner approval.
