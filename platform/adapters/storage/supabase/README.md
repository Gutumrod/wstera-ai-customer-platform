# Supabase Private Storage Adapter

**Status:** Private original-file Storage adapter implemented for the local synthetic G1-HOST-001 slice.

## Responsibility

Upload/access controlled objects, size/type validation and delete lifecycle.

## Dependency and security rule

No public buckets for customer files and no secret URLs in logs.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../../BRIEF.md), [repository structure](../../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths.

See `private-knowledge-storage.ts`. The server-only adapter uses the local service key, immutable paths, byte-verified idempotent retries and server-resolved workspace identifiers. It must not be wired to hosted credentials without separate approval and security review.
