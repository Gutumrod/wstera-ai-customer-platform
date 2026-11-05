# Execution Status

Updated: 2026-11-05 against `main` at `b080d57` (PR #33 merge). Earlier text below was recorded at `e47bb57` and `9b4f997`. This records merged repository state, not product or release approval.

## Current milestone

PR #16 merged the consolidated Phase 0C and G1 foundation work. On 2026-10-25, PR #18 merged the local-only authenticated knowledge host, PR #19 merged a pure PromptPay payload builder, PR #20 merged the typed business-action lifecycle contract/reducer, and PR #21 merged source-import provenance and pilot-gate documentation. PR #24 later added Merchant Brain documents only, at `e47bb57`; the host evidence below was recorded at `9b4f997dc3783c253461a52f70e240d325ff05ec`. PR #18 reports 145 tests, typecheck and optimized Next.js build passing, zero audit findings, and a second-pass review with no actionable High/Medium findings on its candidate; the later independent review `REVIEW-PR18-2026-10-25.md` found M1–M3, and PR #18 merged with them as debt that must close before Gate 3 (register `D-20261025-08`). The authenticated browser-to-Supabase E2E was not run. GitHub returned no combined-status records for the latest merge commit in this status check, so a fresh unified CI result for `9b4f997` is not asserted. These merges do not mean G1 product acceptance or release readiness.

| Area | Merged evidence | Still required for G1 / release |
|---|---|---|
| Phase 0C | Shared tenancy/channel contracts, compatibility exports, and CI trigger update | Remaining modular increments only when separately scoped |
| Knowledge | FAQ lifecycle, bounded local PDF/CSV extraction, deterministic Thai/SKU retrieval, citations, PostgreSQL adapter and PGlite tests; PR #18 adds local synthetic authenticated upload/review/approval and citation search | browser-to-`wstera-lab` E2E, production connection/role wiring, answer quality evidence |
| Handoff | Local state machine, authorization/repository ports, response orchestration | Durable staff state and atomic channel dispatch/compare-and-send |
| AI | Citation provenance validator and metered OpenAI-compatible adapter with mocked transport | Approved live provider/model, semantic answer evaluation, durable usage and spend control |
| PostgreSQL | PGlite RLS/lifecycle tests; historical two-session PostgreSQL evidence from 2026-10-18 | Hosted connection pool/runtime role, host threat review for custom-GUC RLS |
| Verification | Prior PR #16 evidence: 129 tests and 30 synthetic retrieval queries. PR #18 candidate evidence: 145 tests, build and audit; independent review left M1–M3 open, later closed in code by PR #26/#28 (CI recorded on `250bb67` and `acb0e9e`) | Unified CI result for `b080d57`; browser-to-`wstera-lab` host E2E; real one-shop upload → cited answer → durable human handoff trace and independent security acceptance |

PR #19 provides a pure PromptPay EMVCo payload builder; it is not wired to a payment flow and has no real banking-app scan proof. PR #20 provides typed action contracts and a pure lifecycle reducer; it does not include an executor or business writes. PR #21 records provenance and pilot criteria. P3A executor and P4 PromptPay wiring remain planned and unauthorized tasks.

## Merged since 2026-11-02 (BUILD_PASS only)

PR #25 (HOST-004: lab mode fails closed) and PR #23 (AICP objects in schema `aicp`) are merged. PR #26 and PR #28 merged HOST-002: route tests, per-identity rate limits, transactional membership revalidation and M1–M3 closed in code, with revoke/archive moved behind authenticated RPCs. PR #29 merged Core Contract v0.1 as a DRAFT; no independent review report is recorded in `reports/`. PR #30–#33 merged WEBCHAT-001: per-version `visibility` and retrieval `audience`, the visitor chat page with signed session and rate limits, extractive answer and answerability ports, merchant intake `visibility`, and the wire to `SupportOrchestrator`. `npm run check` on `b080d57` reported 423 tests.

What this does not show: the migrations (including `20261104000100_knowledge_visibility.sql`) have never run on Supabase, all database evidence is PGlite, no real host serves the visitor chat, no model is enabled, durable handoff (HANDOFF-002) is not built, and the browser-to-`wstera-lab` E2E was not run. CI runs recorded for HOST-002 cover `250bb67` and `acb0e9e`; a unified CI result for `b080d57` is not asserted here. Nothing above is `PRODUCTION_READY`.

WEBCHAT-HOST-001 follow-on (2026-11-05, branch `codex/aicp-webchat-host-20261105`): local Next.js routes and PostgreSQL/PGlite host composition now exist, with PGlite integration tests. The new migration has not run on Supabase, routes are not deployed, and staff handoff remains unavailable pending HANDOFF-002. This does not change BUILD_PASS-only status.

## Owner decisions 2026-10-25

Docker Desktop is withdrawn from this machine; the host E2E runs against schema `aicp` on `wstera-lab`, and applying the migration needs a separate Owner GO (register `D-20261025-11`). The G1 answer path is extractive citations by default with the model-backed path behind an off-by-default flag; turning the flag on needs separate Owner approval, a budget ceiling, a usage ledger and a data-region choice. Owner work order (`D-20261025-09`) is host hardening → Web Chat → durable handoff → G1 acceptance. Proposed before it, not an Owner decision: HOST-004, then the Owner GO and PR #23 merge decision.

## Remaining G1 work

Task G1-HOST-001 is merged via PR #18: local synthetic authenticated merchant console, workspace resolution, private knowledge upload/quarantine/approval and citation-backed search. Automated checks and reviews are reported in PR #18, with M1–M3 later closed in code by PR #26/#28; browser-to-Supabase E2E remains unverified. This slice does not include Web Chat, generated answers, or durable handoff.

The local synthetic host's Node.js + Next.js + Supabase Auth/Postgres/private Storage architecture was approved for G1-HOST-001; that approval does not extend to hosted deployment or production operation. The PDF extractor uses Node `worker_threads`, which Cloudflare Workers expose as a non-functional stub, so that extraction path cannot run there as-is. No provider spend, hosted migration, customer data or deployment has been authorized.

G2 LINE pilot, G3 self-service multi-tenant onboarding, and G4 commercial validation remain gated behind G1 evidence. Future hosted evaluation region (Singapore), deletion and backup-retention defaults are proposals only and need separate Owner approval.
