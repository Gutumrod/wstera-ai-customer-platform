# Supabase Persistence Adapter

**Status:** FOLDER CONTRACT ONLY - not implemented. **Planned phase:** Phase 1.

## Responsibility

Implement data repositories, Supabase Auth connection and RLS-aware Postgres storage.

## Dependency and security rule

No untrusted tenant header. SQL negative tests and least-privilege server access.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../../BRIEF.md), [repository structure](../../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

No runtime code exists in this folder until a separately reviewed implementation task.
