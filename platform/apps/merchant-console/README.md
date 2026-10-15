# Merchant Console

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1 small QA, Phase 3 self-service.

## Responsibility

Shop profile, staff login, approved knowledge upload/review, playground, inbox and settings.

## Dependency and security rule

Never bypass workspace RBAC or read other shops' documents.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
