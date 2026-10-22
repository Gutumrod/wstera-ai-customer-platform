# Work Queue

Updated: 2026-10-23. Merged code and product acceptance are tracked separately.

## Done on main

- Task 001 foundation/security boundary (PR #2), retained from the initial baseline.
- PR #16 consolidated and merged prior PRs #4–#15 at `857b2e5`; former heads remain preserved in Git ancestry.
- Included slices: Phase 0C tenancy/channel boundary, synthetic knowledge lifecycle and retrieval, bounded local PDF/CSV extraction, retrieval evaluation/SKU normalization, local conversation/handoff core, citation validation, response orchestration, mocked-transport model adapter, and PostgreSQL knowledge persistence with PGlite coverage.

## Current G1 work

| Work | Current state | Next evidence needed |
|---|---|---|
| Authenticated host/bootstrap | G1-HOST-001 implemented on `codex/g1-authenticated-knowledge-host`; review/CI/merge pending | Review security boundaries; run Docker-backed synthetic Supabase E2E when local daemon is available |
| Knowledge upload and approval | Implemented with local-only synthetic scope and automated tests | Verify browser-to-local-Supabase authenticated flow; obtain Owner merge decision |
| Web Chat | No app or web channel adapter | Allowed-origin/session binding, shared-engine answer, citation and abuse-limit tests |
| Durable handoff | Local state/ports only | Persistent staff authorization, durable pause/resume and atomic dispatch/outbox guard |
| Live model and usage | Adapter tested with mocked transport; no provider selected | Owner-approved provider, data region and budget; durable usage ledger and measured answer quality |
| G1 acceptance | No one-shop end-to-end run | Browser trace from upload through grounded answer and human takeover; independent security review |

G2 real LINE sandbox follows G1. G3 onboarding and G4 commercial validation remain gated. Do not deploy, run hosted migrations, or incur provider spend without separate Owner approval.
