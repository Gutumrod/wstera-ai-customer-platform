# Conversation Module

**Status:** PARTIAL LOCAL DOMAIN IMPLEMENTATION on `codex/g1d-conversation-handoff-20261015`; no persistent adapter or channel integration. **Planned phase:** Phase 1 through Phase 2.

## Responsibility

Workspace-scoped conversation identity and lifecycle state machine. Handoff requests pause AI; operator claim, reply-delivery metadata, and authorized release have explicit transitions. The repository port requires atomic version compare-and-append.

## Dependency and security rule

No global userId-only sessions. Handle concurrency and idempotency. The local in-memory test repository is not durable and does not prove cross-process compare-and-swap behavior. Outbound AI delivery must enforce the paused state at its durable dispatch boundary; `canSendAiReply` alone is not an atomic delivery guard.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No production persistence, authenticated channel adapter, staff membership implementation, HTTP endpoint, message-body storage or operator UI exists yet. Customer input has no operation that releases a handoff. Staff authorization is injected through a port and must be resolved from server-validated identity.
