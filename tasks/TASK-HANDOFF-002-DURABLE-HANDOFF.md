# Task HANDOFF-002 — Durable human takeover

**Status: IMPLEMENTED LOCALLY / REVIEW PENDING / HOSTED NOT RUN.** Candidate base: `main` @ `beb0aa50f4e4043585349a347947fee5dfd670b7`; implementation is on `codex/aicp-handoff-002-20261105`.

## Goal

Make the human takeover real: a visitor conversation can be paused durably, a staff member with an active membership claims it, and only an authorized staff action resumes the AI. No customer message can release the pause.

## Scope

- **Persistence**: `20261105000200_durable_handoff.sql` adds conversations, immutable conversation events, messages and staff notifications with `app.workspace_id` RLS. The existing `ConversationRepositoryPort` methods remain unchanged; `PostgresConversationRepository` provides version conflicts.
- **Staff authorization**: every claim/resume resolves the operator from the verified session plus active membership inside the same transaction as the write (same rule as HOST-002).
- **Atomic send**: staff reply transitions, event log and message write are one transaction; workspace delivery IDs are unique. No external channel send occurs in this slice; a notification delivery port is defined for later LINE/email adapters.
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

## Candidate implementation evidence (2026-11-05)

- D-20261105-09: AI continues in `handoff_requested`; only `human_active` pauses it. Repeated customer handoff requests are no-ops.
- Persistence, migration role compatibility, repository restart readback, outbox dedupe, staff membership/tenant denial, idempotent staff reply and customer polling are covered by local PGlite tests.
- Seven migrations passed the local hosted-role compatibility harness. This is not evidence of hosted apply; no hosted database was connected.
- Message retention duration is not configured. No real LINE/email notification is sent. Independent review is still pending.
- `npm run check` passed on 2026-11-05: typecheck passed, 481 tests passed, optimized merchant-console build passed. Independent review is still pending.
