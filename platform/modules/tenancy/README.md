# Workspace & Tenancy Module

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1 minimal; Phase 3 self-service.

## Responsibility

Workspace membership, connection ownership, scoped authorizations and lifecycles.

## Dependency and security rule

Resolve identity from trusted server auth or verified channel only. API + DB/RLS isolation tests required.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
