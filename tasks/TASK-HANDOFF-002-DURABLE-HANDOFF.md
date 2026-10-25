# Task HANDOFF-002 — Durable human takeover

**Status: PLANNED — do not start without Owner GO/dispatch and WEBCHAT-001 merged.** Base: `main` @ `9b4f997`.

## Goal

Make the human takeover real: a visitor conversation can be paused durably, a staff member with an active membership claims it, and only an authorized staff action resumes the AI. No customer message can release the pause.

## Scope

- **Persistence**: PostgreSQL tables for conversations, conversation events and staff assignments with workspace RLS (same `app.workspace_id` transaction-local model), immutable event log, and version/conflict handling. Migration must run under the existing non-owner `knowledge_runtime`-style role rules.
- **Staff authorization**: every claim/resume resolves the operator from the verified session plus active membership inside the same transaction as the write (same rule as HOST-002).
- **Atomic send**: compare-and-send or an outbox guard so a retry or duplicate delivery cannot double-send a staff reply or a paused AI reply.
- **Pause semantics**: pause is durable; no conversation event type lets a visitor release it; a resume without an authorized operator fails closed.
- **Tests**: retry/duplicate delivery, provider/storage failure during send, cross-workspace takeover attempt, resume by a non-member, conversation event ordering.

## Out of scope

LINE channel delivery, live model calls, staff UI beyond the minimum needed to claim/resume, billing, hosted deployment.

## Acceptance

- A paused conversation stays paused across process restart (repository readback test).
- Duplicate send attempts produce exactly one outbound record.
- Non-member and cross-workspace claim/resume attempts fail with no state change.
- No customer-controlled event releases a pause.
- `npm run check` passes; independent reviewer reports no actionable findings.

## Stop conditions

- If the existing conversation contract cannot express durable pause without a breaking change, stop and report the contract delta.
- If the task would touch LINE delivery timing, stop — that belongs to G2.

## Evidence

```
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/modules/handoff/README.md:3 @9b4f997 "**Status:** PARTIAL LOCAL CORE in `platform/modules/conversation/`; persistent handoff and channel delivery are not implemented."
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/modules/conversation/index.ts:1-8 @9b4f997 "import type { ConversationEvent, ConversationRepositoryPort, ConversationSnapshot, ConversationStatus, HandoffReason, StaffAuthorizationPort } from \"../../contracts/data/conversation.js\";"
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/adapters/persistence/postgres/knowledge-repository.ts:364 @9b4f997 "await query.query(\"SELECT set_config('app.workspace_id', $1, true)\", [workspace.workspaceId]);"
```

## PR

Scoped PR with touched paths, migration, fresh test output, security impact, cost impact (none), remaining blockers. Do not self-merge.
