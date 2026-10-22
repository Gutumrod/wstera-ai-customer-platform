# Execution Status

Updated: 2026-10-23. This records merged repository state and current local candidate, not product release approval.

## Current milestone

PR #16 merged the consolidated Phase 0C and G1 foundation work into `main` at merge commit `857b2e5d7521824d416a0932a288c7cb964b39b3`. Its reviewed source head was `19288ecb6b9969c774536ccb42e5589faf9a62a5`; hosted CI passed on that head (run `39840363749`) and on the merge commit (run `39840675679`). The full local suite passed 129/129 on the reviewed source head. PRs #4–#15 were closed as superseded after ancestry verification. This merge does not mean G1 product acceptance or release readiness.

| Area | Merged evidence | Still required for G1 / release |
|---|---|---|
| Phase 0C | Shared tenancy/channel contracts, compatibility exports, and CI trigger update | Remaining modular increments only when separately scoped |
| Knowledge | FAQ lifecycle, bounded local PDF/CSV extraction, deterministic Thai/SKU retrieval, citations, PostgreSQL adapter and PGlite tests | Authenticated upload/approval host, private original-file storage, production connection/role wiring, answer quality evidence |
| Handoff | Local state machine, authorization/repository ports, response orchestration | Durable staff state and atomic channel dispatch/compare-and-send |
| AI | Citation provenance validator and metered OpenAI-compatible adapter with mocked transport | Approved live provider/model, semantic answer evaluation, durable usage and spend control |
| PostgreSQL | PGlite RLS/lifecycle tests; historical two-session PostgreSQL evidence from 2026-10-18 | Hosted connection pool/runtime role, host threat review for custom-GUC RLS |
| Verification | 129 tests pass; synthetic retrieval evaluation covers 30 queries; audits recorded with zero findings on reviewed candidate | Real one-shop upload → cited answer → durable human handoff trace and independent security acceptance |

## Remaining G1 work

Task G1-HOST-001 is implemented on `codex/g1-authenticated-knowledge-host`: local synthetic authenticated merchant console, workspace resolution, private knowledge upload/quarantine/approval, and composition with the shared knowledge engine. Its report records automated test evidence and the missing Docker-backed local Supabase E2E. It has not been reviewed or merged. Next: independent security review, hosted CI, and Owner merge decision. This slice does not include Web Chat, generated answers, or durable handoff.

The current local PDF extractor uses Node `worker_threads`; Cloudflare Workers expose that API as a non-functional stub. A Node runtime is the compatibility recommendation for the first host slice, but the host/auth/storage architecture remains proposed until Owner approval. No provider spend, hosted migration, customer data or deployment has been authorized.

G2 LINE pilot, G3 self-service multi-tenant onboarding, and G4 commercial validation remain gated behind G1 evidence. Future hosted evaluation region (Singapore), deletion and backup-retention defaults are proposals only and need separate Owner approval.
