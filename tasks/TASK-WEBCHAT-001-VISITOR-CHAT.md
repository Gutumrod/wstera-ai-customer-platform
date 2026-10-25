# Task WEBCHAT-001 — Visitor Web Chat vertical slice

**Status: PLANNED — do not start without Owner GO/dispatch and HOST-002 merged.** Base: `main` @ `9b4f997`. Owner decisions 2026-10-25: extractive cited answers are the default; the model-backed path stays behind an off-by-default flag.

## Goal

A visitor on one controlled shop's website can ask a Thai question and receive an answer built only from that workspace's current approved sources, with resolvable citations, or an explicit uncertainty result. No model call runs in G1 acceptance.

## Scope

- **Connection/origin binding**: the visitor request carries only a public web connection identifier; the server resolves workspace from `workspace_connections` (status `active`) and rejects unlisted origins. Never accept a workspace id from the browser.
- **Session**: signed, HttpOnly session cookie bound to the connection; bounded payloads; per-session and per-IP rate limits (same limiter pattern as HOST-002).
- **Answer path**: use the existing `SupportOrchestrator` with an extractive `GroundedAnswerPort` that returns the cited passages verbatim (or a tightly bounded template). Unknown/conflicting/insufficient evidence → uncertainty result and handoff request, never a guessed answer.
- **Model flag**: the model-backed port must only be constructed when an explicit flag is enabled; default off. Add a test asserting no model adapter is instantiated and no network call is possible with the flag off.
- **Visitor UI**: minimal Thai chat page (server-rendered where possible), source chips showing exact source title/version/page/row, and a "ขอคุยกับพนักงาน" action that records a handoff request (durable handoff itself is HANDOFF-002).

## Out of scope

Live model/provider calls, LINE, staff console chat, durable handoff persistence, billing, hosted deployment, multi-shop onboarding.

## Acceptance

- End-to-end test: approved FAQ/PDF/CSV content → Thai question → cited extractive answer whose citation resolves to the exact version and span.
- Unknown-topic question returns uncertainty, not adjacent content; prompt-injection text inside a document cannot change policy.
- Origin/session tests: foreign origin, missing cookie, forged connection id, cross-workspace attempt all fail closed.
- Flag-off test proves no model adapter is constructed.
- `npm run check` passes; independent reviewer reports no actionable findings.

## Stop conditions

- If the shared orchestrator contract needs a breaking change for extractive answers, stop and report the contract delta before editing core modules.
- If a model call would be required for acceptance to pass, stop — that decision belongs to the Owner.

## Evidence

```
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/modules/ai-engine/support-orchestrator.ts:235 @9b4f997 "export class SupportOrchestrator {"
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/modules/ai-engine/support-orchestrator.ts:24 @9b4f997 "export interface GroundedAnswerPort {"
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/apps/merchant-console/app/api/knowledge/search/route.ts:18 @9b4f997 "const result = await retrieveKnowledge(repository, { workspace: identity.workspace, query: body.query, limit: 5 });"
EVIDENCE .worktrees/docs-g1-plan-20261025 platform/contracts/tenancy/index.ts:5-9 @9b4f997 "workspaceId: string; connectionId: string; channel: ChannelId;"
```

## PR

Scoped PR with touched paths, fresh test output, security impact, cost impact (zero provider spend), remaining blockers. Do not self-merge.
