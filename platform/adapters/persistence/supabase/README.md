# Supabase Persistence Adapter

**Status:** Workspace membership lookup and local Supabase host migration are implemented for G1-HOST-001. Production credentials and hosted deployment remain unapproved.

## Responsibility

Implement data repositories, Supabase Auth connection and RLS-aware Postgres storage.

## Dependency and security rule

No untrusted tenant header. SQL negative tests and least-privilege server access.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../../BRIEF.md), [repository structure](../../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

See `workspace-membership-repository.ts` and `workspace-host-migration.test.ts`. Real Supabase Auth/Postgres integration is still an unverified local E2E gate.
