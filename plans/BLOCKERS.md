# Blockers and Owner Gates

Updated: 2026-10-25, after PRs #18–#21 merged; latest observed `main` is `9b4f997`.

| ID | Gate | Evidence / next action |
|---|---|---|
| B-01 | Consolidation merge/review | **Cleared for PR #16:** merged as `857b2e5`; final source head `19288ec` passed hosted CI and independent OpenCode review with no blockers in the reviewed delta. This does not certify G1 or production readiness. |
| B-02 | Hosted CI | **Cleared for PR #16:** `typescript-foundation` passed on reviewed head `19288ec` (run `39840363749`) and merge commit `857b2e5` (run `39840675679`). |
| B-03 | G1 host and product integration | **Host implementation merged in PR #18.** Docker Desktop + Supabase CLI installation approved 2026-10-25; Docker-backed E2E is now the next evidence step. Add route-level tests/rate limiting and resolve the membership-revalidation race inside the write transaction. Carried debt from `REVIEW-PR18-2026-10-25.md` (register `D-20261025-08`): M1 approval privilege mixed with ingest, M2 search/worker load bounds, M3 connection visibility — all must close before Gate 3 and are scoped into TASK-HOST-002. Web Chat and durable human-delivery path remain open. |
| B-04 | Answer quality and spend | Partly decided 2026-10-25: G1 uses extractive cited answers; the model path stays behind an off-by-default flag. Generated-answer grounding, conflicting-source policy, live-provider behavior and production cost remain unmeasured, and enabling the flag needs Owner approval plus a spend ceiling. |
| B-05 | PostgreSQL operational boundary | Open: local PGlite tests and historical 2026-10-18 two-session evidence exist; production host pool/role provisioning and trusted-host/custom-GUC threat review remain unverified. |

No green test clears product, deployment, production-data or spending gates by itself. No hosted migration, customer data or paid API use is authorized by PR #16 merge.
