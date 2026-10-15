# Persistence and Knowledge Ports

**Status:** Provider-neutral knowledge source/version/chunk and retrieval contracts are implemented in `knowledge.ts`; no persistence, object storage, vector index, queue, or durable delivery adapter is implemented.

## Responsibility

Workspace repositories, object storage, retrieval, durable delivery claim/retry, and queue interfaces. The knowledge contracts define scoped DTOs, lifecycle, citations, and replaceable repository/retrieval ports.

## Dependency and security rule

Implementations must apply workspace isolation and recovery semantics. Repository methods receive a server-resolved `TrustedWorkspaceContext`; adapters must enforce scope at their storage boundary rather than trusting row fields.

No database, object-storage, vector-index, queue, or durable delivery implementation exists here. See `../modules/knowledge/README.md` for the bounded local knowledge implementation and verification status.
