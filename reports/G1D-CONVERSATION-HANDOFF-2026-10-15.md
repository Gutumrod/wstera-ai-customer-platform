# G1-D Conversation/Handoff Core — Local Evidence

**Recorded:** 2026-10-15 (Asia/Bangkok)
**Task branch:** `codex/g1d-conversation-handoff-20261015`
**Stack:** PR #10 will target PR #9, which targets PR #8.

## Delivered

- Added provider-neutral conversation DTOs and `ConversationRepositoryPort` / `StaffAuthorizationPort` under `platform/contracts/data/conversation.ts`.
- Added shared conversation state transitions: `ai_active -> handoff_requested -> human_active -> ai_active`.
- AI eligibility is false from handoff request until staff-authorized release. Customer-facing input has no release operation.
- Staff claim/reply/release commands invoke the authorization port. Staff reply delivery metadata stores a delivery ID only; it does not store message content.
- Repository writes carry an expected version for compare-and-append. The test-only in-memory repository rejects stale versions.

## Verification

- `npm run check` — passed; typecheck/build and **39 tests passed, 0 failed**.
- Existing knowledge and G1-C evaluation tests still pass.
- No external provider calls, production data/credentials, paid services, database, or deployment were used.
- No lint script exists in the repository.

## Security and remaining integration

The conversation identity is workspace-scoped. Release requires `StaffAuthorizationPort.assertCanRelease`; production wiring must resolve that identity server-side. The in-memory repository does not prove durable or cross-process atomicity. No HTTP endpoint, persistent adapter, RBAC implementation, operator UI, message body storage, actual staff channel send, or atomic suppression of an already-queued AI send exists yet. The channel dispatch boundary must enforce the same paused state before G1 handoff can be considered end-to-end.

This is a shared core slice only; it does not claim that staff replies or AI responses are currently deliverable to a customer. PR review and Owner merge gates remain pending.

## Follow-up verification — 2026-10-16

The branch was synchronized with the latest G1-C parent after its evaluator input validation fix. Merge resolution kept the current Task 002 status and G1-C evidence updates. The handoff code itself was unchanged by this sync.

| Check | Result |
|---|---|
| `npm run check` | Exit 0; typecheck/build passed; **49 tests passed, 0 failed** |
| `npm run evaluate:knowledge` | Exit 0; 30 synthetic cases; Recall@3 0.963, Precision@3 0.333, citation precision 1.000, retrieval abstention accuracy 1.000 |
| Current-run local retrieval latency | P50 0.176 ms / P95 0.587 ms; one in-memory run, not production performance evidence |
| `npm audit --json` | Exit 0; 0 vulnerabilities across 17 dependencies |
| Independent review | No actionable defects in the G1-D state machine at local HEAD `739f796` |

PR #10 was `DIRTY` against the advanced PR #9 base before this branch sync. After pushing the sync, check GitHub's current merge and hosted-check state; no merge/deploy has occurred.
