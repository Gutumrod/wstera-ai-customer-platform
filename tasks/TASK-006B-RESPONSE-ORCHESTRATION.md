# Task 006B — Provider-neutral grounded response orchestration

**Status:** Local core implemented and tested on `codex/g1-response-orchestration-20261016`; 81/81 tests pass, 0 audit vulnerabilities; independent follow-up review in progress, PR pending.

## Goal

Connect tenant-scoped retrieval to answerability, grounded generation, canonical citation validation, and the existing handoff boundary through replaceable ports. This is the G1-D response-path foundation; it does not select or integrate a model provider.

## Locked behavior implemented

- Use only a server-resolved `TrustedWorkspaceContext`; reject malformed conversation IDs and requests before calling ports.
- Read workspace-scoped conversation state before retrieval and again before returning a generated answer. Suppress output when handoff is active or begins during generation; include the current conversation version for the dispatch boundary.
- Retrieve approved evidence through `KnowledgeRetrievalPort`, validate result shape and evidence/citation identity, and fail closed on malformed or cross-workspace data.
- Require an answerability port to explicitly return `answerable`; insufficient, conflicting, uncertain, malformed, or failed assessment routes to handoff without model generation.
- Give generation opaque evidence reference IDs rather than workspace IDs or citation objects. Map generated references back to retrieved hits and validate canonical citations before returning any answer.
- Bound generated answer text to 16,000 characters and citation references to the number of retrieved hits (up to the configured 20-hit maximum).
- Convert retrieval/generation failures and invalid outputs into low-detail reasons; if the handoff port fails, return `handoff_unavailable` rather than claiming escalation succeeded.

## Acceptance evidence

- Unit tests cover cited answer mapping; active, paused and handoff-during-generation conversation states; no-evidence, insufficient, conflicting and uncertain outcomes; malformed adapter outputs; cross-workspace citations; generation/retrieval/handoff failures; bounded output; and invalid requests.
- `npm run check` covers typecheck/build and all task tests. `npm audit` and `git diff --check` are recorded in the report.

## Scope limits

No model SDK, provider credentials, customer data, database, persistent handoff adapter, Web Chat host/UI, cost measurement or production call is added. Test doubles verify orchestration contracts only. The answerability port has no real semantic implementation yet; the citation validator proves provenance, not semantic support. A successful handoff result proves only that the injected port returned successfully, not that a durable human workflow exists. Conversation reads before/after generation do not prevent handoff starting after the final check; a durable dispatch adapter must atomically enforce the returned conversation version.

See `../reports/G1-RESPONSE-ORCHESTRATION-2026-10-16.md` for verified candidate evidence and remaining gates.
