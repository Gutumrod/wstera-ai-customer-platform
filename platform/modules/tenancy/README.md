# Workspace & Tenancy Module

**Status:** Minimal trusted workspace context implementation migrated in Phase 0C; membership, connection ownership and lifecycle remain unimplemented. **Planned phase:** Phase 1 minimal; Phase 3 self-service.

## Responsibility

Workspace membership, connection ownership, scoped authorizations and lifecycles.

`workspace.ts` contains the existing trusted context constructor and workspace assertion. It has no persistence or authentication resolver; a host must still bind it to a trusted connection. The old `platform/src/core/workspace.ts` path re-exports this API for compatibility.

## Dependency and security rule

Resolve identity from trusted server auth or verified channel only. API + DB/RLS isolation tests required.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
