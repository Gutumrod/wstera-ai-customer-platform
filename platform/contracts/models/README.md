# AI Model Ports

**Status:** Token usage contract implemented; model request implementations live in replaceable adapters. **Phase:** G1-D foundation.

## Responsibility

Text generation, embeddings, streaming capability and normalized usage/errors. Only token usage is currently represented as a shared runtime contract; embeddings and streaming remain unimplemented.

## Dependency and security rule

Avoid provider-specific types or SDKs leaking into shared engine.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

See `index.ts` for the provider-neutral usage-recording port. It records token counts by trusted workspace and operation; currency conversion, pricing and spend limits remain separate contracts.
