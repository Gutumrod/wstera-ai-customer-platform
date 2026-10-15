# AI Model Ports

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1.

## Responsibility

Text generation, embeddings, streaming capability and normalized usage/errors.

## Dependency and security rule

Avoid provider-specific types or SDKs leaking into shared engine.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
