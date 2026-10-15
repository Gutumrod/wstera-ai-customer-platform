# Business Action Ports

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 3+ gated.

## Responsibility

Typed proposal, authorization, confirmation, idempotent execute, verify and audit.

## Dependency and security rule

Not needed for MVP. No payment, order or booking writes from model text.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
