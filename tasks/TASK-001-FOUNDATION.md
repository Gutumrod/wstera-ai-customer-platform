# Codex Cloud Task 001 — Foundation & Security Contract

**Status:** Completed on `main` via PR #2 (`edcf503`). This brief is retained as historical acceptance scope.
**Goal:** Make the current public scaffold a reproducible, reviewable, fail-closed foundation. No production features or live integrations.

## Read first

`AGENTS.md`, `architecture/DECISIONS.md`, `research/04-SOURCE-REUSE-AUDIT.md`, `plans/ROADMAP.md`, `platform/src/`.

## Scope

1. Verify `npm ci && npm run check` in clean cloud; repair only necessary type/module incompatibilities.
2. Review trust boundaries in `createTrustedWorkspace`, LINE signed ingress and typed LINE reply. Harden canonical destination format, valid event shape, upper bounds, zero fake success and code path ambiguity.
3. Add tests for forged signature, malformed data, same `userId` across distinct workspace connections, unsupported events, empty verification requests and all failure paths.
4. Add explicit Interfaces for trusted LINE connection lookup and durable deduplication **without implementing a production database yet**. Do not confuse interface tests with real dedupe.
5. CI must run reproducibly; no credentials or external services required.
6. Update ADR/README accurately for actual behavior and open blockers.

## Non-goals

- No real LINE credentials or API call, webhook deploy, Supabase migration, file upload, AI generation or payment.
- No merging/copying private source repos to public.
- No arbitrary framework expansion or subscription code.

## Acceptance criteria

- `npm ci && npm run check` passes on clean checkout and GitHub Actions.
- Failing tests for invalid signature, cross-tenant attempt, malicious document text and duplicate-event contract are present where relevant.
- Code does not accept client-supplied tenant selection; no silent mock-success path.
- Explicit durable event dedupe still marked NOT IMPLEMENTED if only port interface exists.
- PR lists test output, security assumptions, decision points and any compatibility limits.

## Implementation instructions

Create topic branch, scoped commits, PR against main. Never deploy and never self-merge. If uncertainty blocks security, file an Issue/PR note rather than relaxing guardrails.
