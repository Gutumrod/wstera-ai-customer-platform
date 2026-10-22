# Work Queue

Updated: 2026-10-23. Merged code and product acceptance are tracked separately.

## Done on main

- Task 001 foundation/security boundary (PR #2), retained from the initial baseline.
- PR #16 consolidated and merged prior PRs #4–#15 at `857b2e5`; former heads remain preserved in Git ancestry.
- Included slices: Phase 0C tenancy/channel boundary, synthetic knowledge lifecycle and retrieval, bounded local PDF/CSV extraction, retrieval evaluation/SKU normalization, local conversation/handoff core, citation validation, response orchestration, mocked-transport model adapter, and PostgreSQL knowledge persistence with PGlite coverage.

## Next planned G1 work

| Work | Current state | Next evidence needed |
|---|---|---|
| Authenticated host/bootstrap | Not implemented; runtime/auth architecture still proposed | Owner-approved host runtime, identity/membership model and workspace resolver |
| Knowledge upload and approval | Domain lifecycle and extractor exist; no host or private file storage | Authenticated upload → validation → version persistence/approval with cross-workspace denial |
| Web Chat | No app or web channel adapter | Allowed-origin/session binding, shared-engine answer, citation and abuse-limit tests |
| Durable handoff | Local state/ports only | Persistent staff authorization, durable pause/resume and atomic dispatch/outbox guard |
| Live model and usage | Adapter tested with mocked transport; no provider selected | Owner-approved provider, data region and budget; durable usage ledger and measured answer quality |
| G1 acceptance | No one-shop end-to-end run | Browser trace from upload through grounded answer and human takeover; independent security review |

G2 real LINE sandbox follows G1. G3 onboarding and G4 commercial validation remain gated. Do not deploy, run hosted migrations, or incur provider spend without separate Owner approval.
