# Conversation Module

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1 through Phase 2.

## Responsibility

Workspace-scoped threads, ordered event history, delivery state and lifecycle state machine.

## Dependency and security rule

No global userId-only sessions. Handle concurrency and idempotency.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
