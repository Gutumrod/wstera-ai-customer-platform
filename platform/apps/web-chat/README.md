# Web AI Chat Widget

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1.

## Responsibility

Customer chat iframe/loader, safe origin binding, streaming presentation and accessibility.

## Dependency and security rule

Use shared engine through host/API contracts. Do not embed model keys or merchant credentials in browser.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
