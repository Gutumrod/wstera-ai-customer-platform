# Persistence and Knowledge Ports

**Status:** Provider-neutral knowledge source/version/chunk and retrieval contracts are implemented in `knowledge.ts`; a PostgreSQL knowledge repository is locally implemented and SQL-tested with PGlite. Hosted database wiring, object storage, vector index, queue, and durable delivery adapters remain unimplemented.

## Responsibility

Workspace repositories, object storage, retrieval, durable delivery claim/retry, and queue interfaces. The knowledge contracts define scoped DTOs, lifecycle, citations, and replaceable repository/retrieval ports.

## Dependency and security rule

Implementations must apply workspace isolation and recovery semantics. Repository methods receive a server-resolved `TrustedWorkspaceContext`; adapters must enforce scope at their storage boundary rather than trusting row fields.

The PostgreSQL knowledge repository is in `platform/adapters/persistence/postgres/`; it stores extracted content and locators but does not provide a hosted connection pool, raw object storage, vector index, queue, or durable delivery implementation. See `../modules/knowledge/README.md` and the adapter README for verification boundaries.

The local knowledge contract represents citations with exact content spans and, for extracted documents, source page or logical CSV record locators. The extractor adapter consumes synthetic/local bytes only; it does not provide an upload, storage, or asynchronous processing boundary.

`conversation.ts` defines workspace-scoped conversation snapshots, handoff events, atomic compare-and-append persistence, and staff authorization ports. It is a contract only; the local state machine/test repository do not establish durable storage or production staff authorization.
