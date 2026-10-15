# Workspace & Tenancy Module

**Status:** Minimal trusted workspace context implementation migrated in Phase 0C; membership, connection ownership and lifecycle remain unimplemented. **Planned phase:** Phase 1 minimal; Phase 3 self-service.

## Responsibility

Workspace membership, connection ownership, scoped authorizations and lifecycles.

`contracts/tenancy` owns `TrustedWorkspaceContext` and its provider-neutral `ChannelId`. `workspace.ts` contains the existing trusted context constructor and workspace assertion. It has no persistence, membership check, runtime tenant authorization or authentication resolver; a host must still bind it to a trusted connection and enforce authorization at API and data boundaries. The old `platform/src/core/workspace.ts` path re-exports this API for compatibility. Web and LINE are current IDs; any additional channel requires a later explicit design decision.

## Dependency and security rule

Resolve identity from trusted server auth or verified channel only. API + DB/RLS isolation tests required.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
