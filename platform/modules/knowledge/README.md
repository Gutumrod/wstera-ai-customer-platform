# Knowledge Module

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1.

## Responsibility

PDF/CSV/FAQ source lifecycle, extraction, approval, chunk indexing, retrieval policy and citations.

## Dependency and security rule

Only approved/current workspace sources; deletion propagation; Thai and SKU evaluation.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
