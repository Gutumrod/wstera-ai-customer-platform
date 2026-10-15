# Usage & Budget Module

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1 spend cap, Phase 3 metering.

## Responsibility

Tokens, request accounting, shop spending limit, abuse throttling and eventual billing meters.

## Dependency and security rule

Keep billing integration optional until revenue validation; no model usage without bounds.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
