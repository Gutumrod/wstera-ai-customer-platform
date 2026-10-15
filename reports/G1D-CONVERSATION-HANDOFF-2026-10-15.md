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
