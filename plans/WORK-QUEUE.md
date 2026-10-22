# Work Queue

Updated: 2026-10-23. Candidate implementation is distinct from acceptance or release.

## Done on main

- Task 001 foundation/security boundary (PR #2), main `edcf503`.
- Locked product goals and initial modular architecture (PR #3).

## Consolidated candidate

`codex/pr-consolidation-20261023` preserves PRs #4–#15, Task 007A local follow-up, and historical synthetic PostgreSQL evidence. The superseded PR branches remain available; no branch deletion or self-merge is part of cleanup.

| Work | Candidate state | Next gate |
|---|---|---|
| Brief, Phase 0C contracts, planning, CI | Included | Independent review and Owner merge |
| Task 002 / G1-A | Synthetic FAQ lifecycle and retrieval included | Review; authenticated ownership remains separate |
| Task 003 / G1-B | Bounded PDF/CSV extraction included | Review; authenticated upload/private storage remains separate |
| Task 004 / G1-C and SKU follow-up | 30-query lexical baseline and unique SKU normalization included | Owner quality thresholds; generated answers remain unmeasured |
| Task 005 / G1-D | Local handoff state machine included | Durable repository and atomic delivery enforcement |
| Task 006A/B/C | Citation validator, orchestration and mocked model adapter included | Live-provider/semantic evaluation and durable usage |
| Task 007A | PostgreSQL adapter and local follow-up included; consolidated candidate currently passes 129 full-suite tests (initial Task 007A evidence remains 112) | Independent candidate review, host role/pool wiring |

## Not implemented / not unlocked

Authenticated upload/approval, private original-file storage, production auth, live model setup, durable staff/usage state, Web Chat, one-shop end-to-end proof and real LINE pilot remain separate scoped work. G2–G4 and deployment remain gated.
