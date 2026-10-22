# Future Codex Task — Incremental Modular Boundaries

**Status (2026-10-23):** The shared channel/workspace contracts and single-boundary migration (I1 and the approved I2 slice) were included in PR #16 and merged on `main` (`857b2e5`). Composition wiring and later increments remain separately scoped and gated.

## Phase 0C migration slice — approved scope

- **Specification:** define provider-neutral `InboundMessage`, `ChannelPort`, and normalized channel error contracts under channels; own `TrustedWorkspaceContext` and `ChannelId` under `platform/contracts/tenancy/`; relocate only the existing trusted workspace constructor/assertion into `platform/modules/tenancy/`; preserve old workspace API and channel type imports with compatibility re-exports.
- **Acceptance criteria:** existing behavior and exports remain compatible; message/user IDs are connection-scoped by contract; channel delivery failures use bounded normalized metadata; tenancy module depends only on contracts; all baseline and new contract tests pass; no adapters, network calls, database migration, or duplicate engine is added.
- **Dependencies:** Task 001 merged and reviewed; Phase 0B architecture/docs merged; Owner approved this scope. These are now satisfied for this slice.
- **Owner decision locked for this slice:** migrate the workspace boundary and add shared channel contracts only. Keep the legacy path as a compatibility re-export; defer I3 composition/fake adapters and I5 deletion of compatibility code to later scoped work.
- **Runtime boundary:** the context constructor and assertion do not implement membership, connection ownership lookup, or runtime tenant authorization; those remain NOT IMPLEMENTED and require trusted host binding plus API/database enforcement. Web and LINE are the current channel IDs; any additional channel remains a later explicit design decision.

## Goal

Implement the adapter-ready repo layout in `architecture/REPOSITORY-STRUCTURE.md` without duplicating core logic or breaking LINE security or existing exports. Every new component is owned by one module and depends on typed ports.

## Prerequisites

- Task 001 PR review findings M1/M2 resolved and accepted, with CI pass.
- Owner agrees scope and identifies migration PR boundary.
- Read `BRIEF.md` LOCKED requirements; review architecture + Phase breakdown.

## Implementation increments

- I1: Define types and contract tests for `InboundMessage`, `TrustedWorkspaceContext`, `ChannelPort` and normalized error handling.
- I2: Move *one* existing proven boundary from `platform/src` into target module/adapter; preserve imports via compatibility re-export.
- I3: Add composition wiring and one fake channel + model adapter to test a shared engine path without network.
- I4: Prove workspace scoping + no second RAG/AI implementation; verify no core vendor imports.
- I5: Remove old duplicate file only in scoped PR with test evidence and Owner approval.

## Acceptance / stop conditions

- Clean `npm ci && npm run check`; all existing 9+ baseline tests still pass plus module contract tests.
- `platform/modules` import no `apps/`, `adapters/`, Next.js/LINE/Supabase SDKs.
- New LINE/Web transport joins shared typed contracts and no ambient tenant singleton exists.
- No live LINE, payment, model, Supabase or Cloudflare deployment; no secrets/PII/public private-source imports.
- PR contains module diff map, import graph, rollback, changed API surface and reviewer findings.
- **Stop** if Task 001 work is not merged/approved or any trust boundary weakens.
