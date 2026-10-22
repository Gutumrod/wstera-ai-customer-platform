# Merchant Console

**Status:** Local synthetic authenticated knowledge console implemented in Task G1-HOST-001. This is an unmerged prototype and does not complete G1. **Scope:** controlled one-workspace host slice; Web Chat and self-service remain out of scope.

## Responsibility

Supabase staff login, server-resolved workspace membership, FAQ/PDF/CSV upload and validation, source review/owner approval, private original storage, quarantine view, and deterministic citation search. Inbox, visitor chat and shop onboarding are not implemented here.

## Dependency and security rule

Never bypass workspace RBAC or read other shops' documents. The workspace is selected from the authenticated user's active membership and owned web connection; never accept a workspace selector from a request. Local bootstrap is restricted to loopback Supabase and uses synthetic data only.

Do not add vendor SDK calls to core modules. Follow [the master brief](../../../BRIEF.md), [repository structure](../../../architecture/REPOSITORY-STRUCTURE.md) and [adapter contracts](../../../architecture/PORTS-AND-ADAPTERS.md); for deeply nested folders use repository-root paths. See [the G1-HOST-001 implementation report](../../../reports/G1-HOST-001-IMPLEMENTATION.md) for verification limits and remaining approval gates.
