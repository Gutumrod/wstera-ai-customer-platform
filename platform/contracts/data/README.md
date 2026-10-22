# Persistence and Knowledge Ports

**Status:** Provider-neutral knowledge source/version/chunk, storage, intake-audit and retrieval contracts are implemented; PostgreSQL knowledge and local private Storage adapters are exercised with PGlite and fakes. Hosted database/storage wiring, vector index, queue, and durable delivery adapters remain unimplemented.

## Responsibility

Workspace repositories, object storage, retrieval, durable delivery claim/retry, and queue interfaces. The knowledge contracts define scoped DTOs, lifecycle, citations, and replaceable repository/retrieval ports.

## Dependency and security rule

Implementations must apply workspace isolation and recovery semantics. Repository methods receive a server-resolved `TrustedWorkspaceContext`; adapters must enforce scope at their storage boundary rather than trusting row fields.

The PostgreSQL knowledge repository is in `platform/adapters/persistence/postgres/` and the local private object adapter is in `platform/adapters/storage/supabase/`. They do not prove hosted operation, provide a vector index, queue, or durable delivery implementation. See `../modules/knowledge/README.md` and adapter READMEs for verification boundaries.

The local knowledge contract represents citations with exact content spans and, for extracted documents, source page or logical CSV record locators. The extractor adapter consumes synthetic/local bytes only; it does not provide an upload, storage, or asynchronous processing boundary.

`conversation.ts` defines workspace-scoped conversation snapshots, handoff events, atomic compare-and-append persistence, and staff authorization ports. It is a contract only; the local state machine/test repository do not establish durable storage or production staff authorization.
