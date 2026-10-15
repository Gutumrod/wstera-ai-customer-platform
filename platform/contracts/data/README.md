# Persistence/Knowledge Ports

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1/2.

## Responsibility

Workspace repositories, object storage, retrieval, durable delivery claim/retry, queue interfaces.

## Dependency and security rule

Implementations must apply workspace isolation and recovery semantics.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
