# Cross-Boundary Contract Tests

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1 onward.

## Responsibility

Channel/provider/DB adapter conformance, Thai eval fixtures and cross-tenant integration tests.

## Dependency and security rule

Every new adapter must pass shared security and behavior contract tests; no live PII fixtures.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../BRIEF.md), [repository structure](../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
