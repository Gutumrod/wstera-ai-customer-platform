# Execution Status

Updated: 2026-10-25 against `main` at `9b4f997dc3783c253461a52f70e240d325ff05ec`. This records merged repository state, not product or release approval.

## Current milestone

PR #16 merged the consolidated Phase 0C and G1 foundation work. On 2026-10-25, PR #18 merged the local-only authenticated knowledge host, PR #19 merged a pure PromptPay payload builder, PR #20 merged the typed business-action lifecycle contract/reducer, and PR #21 merged source-import provenance and pilot-gate documentation. Latest observed `main` is merge commit `9b4f997dc3783c253461a52f70e240d325ff05ec`. PR #18 reports 145 tests, typecheck and optimized Next.js build passing, zero audit findings, and a second-pass review with no actionable High/Medium findings on the reviewed candidate. The local Docker-backed authenticated Supabase E2E was not run. GitHub returned no combined-status records for the latest merge commit in this status check, so a fresh unified CI result for `9b4f997` is not asserted. These merges do not mean G1 product acceptance or release readiness.

| Area | Merged evidence | Still required for G1 / release |
|---|---|---|
| Phase 0C | Shared tenancy/channel contracts, compatibility exports, and CI trigger update | Remaining modular increments only when separately scoped |
| Knowledge | FAQ lifecycle, bounded local PDF/CSV extraction, deterministic Thai/SKU retrieval, citations, PostgreSQL adapter and PGlite tests; PR #18 adds local synthetic authenticated upload/review/approval and citation search | Docker-backed browser-to-local-Supabase E2E, route-level tests/rate limiting, membership-revalidation race resolution, production connection/role wiring, answer quality evidence |
| Handoff | Local state machine, authorization/repository ports, response orchestration | Durable staff state and atomic channel dispatch/compare-and-send |
| AI | Citation provenance validator and metered OpenAI-compatible adapter with mocked transport | Approved live provider/model, semantic answer evaluation, durable usage and spend control |
| PostgreSQL | PGlite RLS/lifecycle tests; historical two-session PostgreSQL evidence from 2026-10-18 | Hosted connection pool/runtime role, host threat review for custom-GUC RLS |
| Verification | Prior PR #16 evidence: 129 tests and 30 synthetic retrieval queries. PR #18 candidate evidence: 145 tests, build, audit and second-pass review | Fresh unified CI on `9b4f997`; Docker-backed host E2E; real one-shop upload → cited answer → durable human handoff trace and independent security acceptance |

PR #19 provides a pure PromptPay EMVCo payload builder; it is not wired to a payment flow and has no real banking-app scan proof. PR #20 provides typed action contracts and a pure lifecycle reducer; it does not include an executor or business writes. PR #21 records provenance and pilot criteria. P3A executor and P4 PromptPay wiring remain planned and unauthorized tasks.

## Owner decisions 2026-10-25

Docker Desktop + Supabase CLI installation is approved for the local E2E on this machine. The G1 answer path is extractive citations by default with the model-backed path behind an off-by-default flag; turning the flag on needs separate Owner approval, a budget ceiling, a usage ledger and a data-region choice. Work order is host hardening → Web Chat → durable handoff → G1 acceptance.

## Remaining G1 work

Task G1-HOST-001 is merged via PR #18: local synthetic authenticated merchant console, workspace resolution, private knowledge upload/quarantine/approval and citation-backed search. Automated checks and a second-pass review are reported in PR #18; Docker-backed browser-to-local-Supabase E2E remains unverified. This slice does not include Web Chat, generated answers, or durable handoff.

The local synthetic host's Node.js + Next.js + Supabase Auth/Postgres/private Storage architecture was approved for G1-HOST-001; that approval does not extend to hosted deployment or production operation. The PDF extractor uses Node `worker_threads`, which Cloudflare Workers expose as a non-functional stub, so that extraction path cannot run there as-is. No provider spend, hosted migration, customer data or deployment has been authorized.

G2 LINE pilot, G3 self-service multi-tenant onboarding, and G4 commercial validation remain gated behind G1 evidence. Future hosted evaluation region (Singapore), deletion and backup-retention defaults are proposals only and need separate Owner approval.
