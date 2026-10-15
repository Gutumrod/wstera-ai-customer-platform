# Future Codex Task — Incremental Modular Boundaries

**Status:** PLANNED / BLOCKED ON ACCEPTED TASK 001 and owner review. Not an instruction to implement immediately.

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
