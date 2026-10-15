# Application Composition Root

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1 onward.

## Responsibility

Validate env, wire ports to adapters, workspace feature flags and server-side provider routing.

## Dependency and security rule

Only host/composition imports both modules and vendor adapters; invalid configuration fails closed.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../BRIEF.md), [repository structure](../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
