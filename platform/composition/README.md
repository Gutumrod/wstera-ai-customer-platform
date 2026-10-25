# Application Composition Root

**Status:** G1-HOST-001 composition implemented locally for synthetic knowledge intake and merchant host wiring. Web Chat and provider routing remain out of scope.

## Responsibility

Validate env, wire ports to adapters, workspace feature flags and server-side provider routing.

## Dependency and security rule

Only host/composition imports both modules and vendor adapters; invalid configuration fails closed.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../BRIEF.md), [repository structure](../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

See `merchant-knowledge-host.ts` and `knowledge-intake.ts`. The current composition requires local server-only configuration and is not production/deployment evidence. See [the task report](../../reports/G1-HOST-001-IMPLEMENTATION.md).
