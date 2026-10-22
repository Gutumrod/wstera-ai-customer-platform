# Blockers and Owner Gates

Updated: 2026-10-15. Items below are based on current repository and GitHub evidence.

| ID | Blocker / gate | Evidence | Required next action |
|---|---|---|---|
| B-01 | PR #4 has no review and targets an older main base | Open PR #4 head `579399b`; base `80b05f9`; CI passes; current main `edcf503` | Owner decides whether to update base and merge; correct the stale PR #2 blocker wording during reconciliation |
| B-02 | PR #5 lacks evidence of independent review | Latest review text is an Owner-authored comment; its author is also PR author `Gutumrod`; CI passes; PR is open | Obtain an independent review from a different reviewer; then Owner decides merge |
| B-03 | Task 002 is explicitly PLANNED | `tasks/TASK-002-RAG-CONTRACT.md` on main; `tasks/README.md` says do not start until Task 001 passes | Owner approves an executable scope/base after Phase 0C is accepted; update stale task index on an approved docs change |
| B-04 | RAG stack and evaluation thresholds remain proposed/open | Research 02 calls the stack proposed and says no numeric threshold is accepted before an observed baseline | Establish baseline on synthetic data, then have Owner approve thresholds and provider/tokenizer choices |
| B-05 | No paid provider or cloud budget is approved here | Mission prohibits new costs without approval; no provider is locked in the current decisions | Keep work provider-neutral/synthetic until Owner explicitly approves any spend or external service |
| B-06 | Runtime trust and persistence are not established by current contracts | PR #5 review notes that contracts do not implement runtime authentication, membership/RLS, connection ownership, persistence, RAG or integration | Include actual boundary tests and persistence/security review in scoped G1 tasks; do not count types/unit contracts as product proof |

No blocker is cleared by a green CI check alone. Do not merge, deploy, access production, use customer data or incur new costs without the applicable Owner gate.
