# Task 005 — Shared Conversation and Handoff Core (G1-D foundation)

**Status:** Local core implemented and independently reviewed on `codex/g1d-conversation-handoff-20261015`; branch synchronized with the latest PR #9 base. Local `npm run check` passes 49 tests. PR #10 remains open; no production adapter or merge has occurred.

## Goal

Implement a channel-neutral conversation control state machine that pauses AI during human takeover and resumes only after a server-authorized staff release.

## Locked requirements applied

- One shared conversation/handoff core for Web Chat and LINE.
- Workspace-scoped conversation identity; no global user-ID-only thread.
- Customer-originated input cannot release human ownership.
- AI remains paused after handoff request and operator claim; only a staff authorization port can release it.
- Repository writes use expected-version compare-and-append so production adapters can enforce atomic state changes.

## Acceptance criteria

- Explicit transitions for AI active -> handoff requested -> human active -> AI active.
- Staff claim/reply/release operations call an injected authorization port.
- Invalid transitions, forged workspace lookup, unauthorized release, and stale versions fail closed.
- Staff delivery metadata does not store message bodies or customer PII.
- Existing tests plus new handoff tests pass.

## Limitations

The in-memory adapter is test-only. This does not implement persistence, RBAC, HTTP endpoints, message delivery, operator UI, or atomic suppression of an already queued AI send. A PostgreSQL/Supabase adapter and cross-process race proof are required before calling handoff durable. The channel layer must check the same state at the dispatch boundary.

## Evidence

See `../reports/G1D-CONVERSATION-HANDOFF-2026-10-15.md` after verification.
