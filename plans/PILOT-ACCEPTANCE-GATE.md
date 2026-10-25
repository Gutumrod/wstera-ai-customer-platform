# Pilot acceptance gate

Status: criteria only. No item below has evidence yet. Adapted from the retired private product's
pilot gate (see `architecture/SOURCE-IMPORT-PROVENANCE.md`); commercial and pricing content was
dropped on purpose.

Rule: no document and no agent may mark this platform pilot-ready unless every blocking item has
re-runnable evidence. `BUILD_PASS != PRODUCTION_READY != LIVE_PROVEN != OPERATED_STABLE`.

## A. Conversation and grounding

- [ ] Real LINE OA webhook round-trip works against a test channel (never run in any WSTERA repo).
- [ ] An unknown product/service query returns an explicit unknown/fallback, never unrelated data.
- [ ] Multi-turn context stays coherent for representative Thai conversations.
- [ ] Every business fact in an answer traces to a knowledge hit or an authorised tool result.

## B. Human handoff

- [ ] Handoff pauses AI replies durably; the customer cannot reset it by writing a phrase.
- [ ] The handoff record carries what the operator needs to continue without re-asking.
- [ ] Release requires an authorised operator.
- [ ] Inbound distress or an explicit staff request reaches handoff instead of a generated answer.

## C. Business actions

- [ ] A state-changing action cannot execute without backend authorisation **and** explicit
      confirmation (contract exists; executor does not).
- [ ] Retries and webhook replays cannot create duplicate business records.
- [ ] A tool or provider failure produces a safe retry/fallback/handoff, never a false success.
- [ ] A model cannot raise its own risk level or self-confirm.

## D. Tenancy and security

- [ ] No request path reaches workspace data without a server-resolved identity.
- [ ] Negative cross-tenant tests pass at API, repository and retrieval boundaries.
- [ ] LINE signature verification fails closed on missing or invalid signature.
- [ ] Secrets never appear in source, prompts, logs or seed scripts.
- [ ] Every state-changing action leaves auditable evidence.

## E. Measurement baseline

Record observed values only, never estimates presented as measurements: P50/P95 latency,
grounded-answer error rate, handoff rate, duplicate side-effect count, tool failure and recovery rate.

## Verdict values

`NOT RUN` · `FAILED` · `PASSED FOR CONTROLLED PILOT`. Commercial launch, pricing and multi-tenant
paid operation are separate decisions with their own gates.
