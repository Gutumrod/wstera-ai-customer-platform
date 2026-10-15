# Postgres Vector Adapter

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1.

## Responsibility

Implement tenant-filtered hybrid/vector and exact SKU search for approved sources.

## Dependency and security rule

Prove Thai and SKU retrieval; vector search alone cannot guarantee factuality.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../../BRIEF.md), [repository structure](../../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
