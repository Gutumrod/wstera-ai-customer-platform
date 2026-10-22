# Blockers and Owner Gates

Updated: 2026-10-23. Replaces the stale 2026-10-15 queue snapshot.

| ID | Gate | Evidence / next action |
|---|---|---|
| B-01 | Consolidated review and Owner merge | Former PRs #4–#15 are preserved in one candidate. Fresh local tests do not replace independent code/security review or authorize self-merge. |
| B-02 | Hosted verification | Original feature-targeted PRs had no Actions runs because CI filtered the target branch. The candidate includes PR #12 and targets `main`; verify its own head check before merge. |
| B-03 | G1 product integration | No authenticated upload, host auth/pool, live model, Web UI or durable human delivery is demonstrated. Define and approve the next scoped task after candidate acceptance. |
| B-04 | Quality and spend decisions | Synthetic retrieval is measured; generated-answer grounding, conflict/policy decisions and production cost remain unmeasured. No paid provider is selected. |
| B-05 | PostgreSQL operational boundary | PGlite tests pass; historical two-session evidence is preserved, not freshly rerun. Runtime role/pool provisioning and arbitrary-SQL custom-GUC threat boundary need host review. |

No green test clears product, merge, production or spending gates by itself. No deployment, hosted migration, customer data or paid API is included.
