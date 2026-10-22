# Workspace & Tenancy Module

**Status:** Trusted workspace context and a provider-neutral authenticated merchant identity resolver are implemented. Persistent lookup is supplied by the Supabase adapter; self-service lifecycle remains unimplemented.

## Responsibility

Workspace membership, connection ownership, scoped authorizations and lifecycles.

`contracts/tenancy` owns `TrustedWorkspaceContext` and provider-neutral merchant membership/role contracts. `workspace.ts` constructs the immutable context; `merchant-identity.ts` resolves an authenticated user to exactly one active workspace and web connection. The old `platform/src/core/workspace.ts` path re-exports the original API for compatibility. Web and LINE are current IDs; any additional channel requires an explicit design decision.

## Dependency and security rule

Resolve identity from trusted server auth or verified channel only. API + DB/RLS isolation tests required.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

This module has no vendor SDK or persistence dependency. It receives membership bindings from a trusted adapter and rejects no membership, ambiguity, and repository failures. Durable onboarding and broader workspace lifecycle remain out of scope.
