# Work Queue

Updated: 2026-10-15. “Verified” means checked against fetched GitHub state or the current main tree. Proposed G1 slices are not executable task approvals.

## Done

- **Task 001 — Foundation & security contract:** merged in PR #2; main commit `edcf503236e917121c2e31b6bbff646dc78d0d61`; GitHub Actions `typescript-foundation` SUCCESS.

## In review / gated

- **PR #4 — Short Project Brief:** CI passes, no review recorded, still open; base predates current main by the Task 001 commit. Owner review/merge decision and base reconciliation remain.
- **PR #5 — Phase 0C workspace/channel contracts:** CI passes; owner comment records PASS WITH NOTES after M1 remediation; still open. Independent review from a reviewer other than the PR author and Owner merge decision remain.

## G1 proposal — execute in dependency order after approval

| Slice | Deliverable | Acceptance evidence | Dependency / status |
|---|---|---|---|
| G1-A: knowledge contracts | Workspace-scoped source/version/chunk lifecycle, approval/revoke/delete, retrieval and citation contracts | Contract and negative tests for workspace tampering, revoked/version-conflict sources, zero results and mixed Thai/SKU queries | Existing `TASK-002-RAG-CONTRACT.md` is PLANNED; needs scoped approval and accepted Phase 0C base |
| G1-B: synthetic ingestion | FAQ first, then bounded PDF/CSV extraction, traceable chunks, approval and re-index/delete lifecycle | Synthetic fixtures; extraction failure/quarantine tests; source-to-chunk traceability; no private/customer material | G1-A contract accepted; storage/processing choices and limits approved |
| G1-C: retrieval and evaluation | Thai-aware hybrid lexical/vector retrieval with exact SKU path and evidence sufficiency policy | Owner-reviewed synthetic evaluation set; retrieval/citation/grounding/unknown metrics; cross-workspace and injection negatives | G1-B; provider/tokenizer/rerank choices and pass thresholds approved after baseline |
| G1-D: shared answer path | Explicit model/embedding ports, bounded generation, errors, usage/cost meter, grounded answer or handoff | Provider contract tests, unavailable/timeout/budget cases, grounded citations and no fake success | G1-C; model/provider and any spend explicitly approved |
| G1-E: Web Chat + operator handoff | Website chat transport/UI and minimal staff response path over the shared engine | Browser-level synthetic shop walkthrough, allowed-origin checks, durable pause/resume and staff authorization | G1-D; widget/auth/handoff contracts accepted |
| G1-F: G1 integration gate | One-shop upload → approve → Thai query → cited response → human takeover/resume | Reproducible E2E trace, zero cross-workspace access, failure cases, latency/error/usage/cost evidence and independent security review | G1-A through E; Owner demo and approval |

## Not issued

- No executable Task 003/004 brief exists in `main`; do not infer approval from the roadmap outline.
- G2 LINE live sandbox, G3 multi-workspace self-service and G4 commercial release remain later gates.
