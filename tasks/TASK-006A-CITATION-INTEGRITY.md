# Task 006A — Retrieved Citation Integrity (G1-E foundation)

**Status:** Implemented on `codex/g1e-citation-integrity-20261016` at code commit `779999a`; 49 tests pass and independent review found no actionable issue. Provider-neutral core slice, no provider or host integration.

## Goal

Accept a draft response only when every citation in it exactly matches evidence retrieved for the same trusted workspace. Return a fail-closed handoff decision for missing evidence, malformed output, or unsupported citations.

## Scope and boundaries

- Implement a pure module under `platform/modules/ai-engine/`; no channel, database, framework, model SDK, or provider imports.
- Treat model output as untrusted runtime input even though the TypeScript contract is typed.
- The caller supplies only hits from the trusted tenant-scoped retrieval path and a server-resolved workspace; this validator cannot independently prove approval status or authenticate arbitrary evidence objects.
- Canonicalize accepted citations from retrieved evidence, not from the draft object.
- Reject inconsistent retrieval-hit source/version metadata, malformed locator shapes, and foreign-workspace evidence.
- Reject foreign-workspace evidence and cross-workspace/fabricated/malformed citations.
- Keep this validator distinct from answerability: exact citation membership does not prove that evidence semantically supports each claim.
- No model generation, provider adapter, conflict detection, policy, HTTP/UI, persistence, or claims of end-to-end/production readiness.

## Acceptance criteria

- A valid response with citation(s) present in retrieved evidence is accepted and contains canonical evidence citations.
- Empty/invalid response, no evidence, no citation, foreign evidence, cross-workspace citation, malformed locator, and unsupported citation fail closed with stable reason codes.
- Duplicate citations do not multiply the returned citation list.
- Tests cover FAQ span, PDF page, and CSV row locators, exact identity matching, workspace mismatch, and malformed untrusted shapes.
- `npm run check`, retrieval evaluation, dependency audit, and diff hygiene pass; independent review is recorded before PR update.

## Stop conditions

- Do not infer semantic answerability or resolve conflicting evidence.
- Do not add a provider, paid API, credentials, persistence, or channel delivery.
- Do not merge or deploy.

## Evidence

See [`G1E-CITATION-INTEGRITY-2026-10-16.md`](../reports/G1E-CITATION-INTEGRITY-2026-10-16.md).
