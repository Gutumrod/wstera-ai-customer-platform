# Task 007A — Durable PostgreSQL knowledge repository

**Status:** Implementation checkpoint in progress on `codex/g1-knowledge-postgres-final-20261016`, based on commit `fc3d52517cbf93727e74510c24d89d3630e5e2d0` (PR #15 base `f8d8aae0fffcb09e058bc66195ce555cb865a17c`). Canonical draft validation is now shared by the PostgreSQL adapter and in-memory repository. Independent review and true PostgreSQL two-session race evidence remain pending; do not claim concurrency verified.

## Current state

The G1 knowledge module and extractor can create, approve, revoke and retrieve FAQ/PDF/CSV versions, but the only repository is the test-only in-memory implementation. There is no database or authenticated upload host. The current source of truth explicitly names a persisted repository and authenticated upload/approval path as the next executable slice; this task implements the persistence half.

## Goal

Implement the existing `KnowledgeRepositoryPort` on PostgreSQL without selecting a hosted provider or changing the shared knowledge contract. Enforce tenant scoping in every query and at the database row-security boundary, preserve atomic approval and immutable source-addressable versions, and prove the SQL behavior locally.

## Scope

- Add a PostgreSQL migration for workspace-scoped knowledge sources, immutable versions and source-addressable chunks.
- Enable and force row-level security on all tenant tables using transaction-local `app.workspace_id`; document runtime role requirements (non-superuser, no `BYPASSRLS`, not a migration owner connection).
- Add a transaction/query port and `PostgresKnowledgeRepository` implementing the full existing repository contract with parameterized queries, transactional workspace context and safe domain errors.
- Enforce version/source consistency, content/chunk identity, lifecycle transition rules, immutable approved/revoked content, and at most one approved version per source under concurrent approval.
- Add PGlite as a development-only SQL integration dependency; execute the migration and exercise the adapter as a non-owner, non-superuser role. Cover cross-workspace reads/writes, stale tenant context, approval uniqueness, version conflicts, rollback and exact page/row/span citations.
- Update architecture/task/report status and test command.

## Acceptance

- `PostgresKnowledgeRepository` implements every `KnowledgeRepositoryPort` method.
- Real PostgreSQL SQL via PGlite proves RLS and the required atomic/constraint behavior; fake query results alone are insufficient.
- All tests, typecheck/build, dependency audit and `git diff --check` pass; independent security review reports no actionable findings.
- No production database, migration, credential, customer data, paid service, upload HTTP endpoint, auth provider, object storage, live retrieval service or deployment is used.
- Open a scoped PR stacked on PR #15. Do not merge or apply the migration to a hosted database.

## Remaining gates

An authenticated upload/approval HTTP path, real host connection pool and role provisioning, private object storage, durable conversations/handoff and usage ledger, Web Chat, provider selection/semantic evaluation, and the one-shop end-to-end proof remain separate work.

## Checkpoint — 2026-10-16

- `npm run check`: PASS — TypeScript typecheck/build and 110 tests (including 5 PGlite integration cases).
- `npm audit --json`: PASS — 0 vulnerabilities across 18 dependency records.
- `npm audit --omit=dev --json`: PASS — 0 vulnerabilities across 18 dependency records.
- `git diff --check`: PASS.
- Database evidence is local PGlite only, using a non-owner, non-superuser role; no hosted database or provider was contacted.
- First independent review found that an unlocked RLS `EXISTS` could race chunk insertion against approval. A `BEFORE INSERT` trigger now locks the parent version and rejects chunks unless the version is still mutable; a regression test rejects sequential insertion after approval. `listRetrievableChunks` also returns each version with its full chunk set, and the adapter README now states the custom-GUC RLS threat boundary.
- Independent re-review is pending. PGlite direct mode is single-connection, so the current test does not prove the true two-session interleaving; use a supported PostgreSQL multi-session test substrate before claiming the race is fully verified.
- Next: finish independent security review and resolve the true two-session race verification gate. Do not claim Task 007A complete while either required acceptance item remains open. PR/commit/push steps are outside the current user's authorization.

## Working-tree follow-up — 2026-10-16

- `canonicalizeKnowledgeVersionDraft` now owns canonical rebuild/validation in the pure knowledge module. Both `InMemoryKnowledgeRepository` and `PostgresKnowledgeRepository` use it, so FAQ spans and imported page/row chunks must match the shared builder's exact segmentation, identities, offsets and locators before persistence.
- Added PostgreSQL adapter regressions that submit noncanonical FAQ and PDF chunk boundaries; both are rejected before a version row is stored.
- Fresh `npm run check`: PASS — 111 tests, 0 skipped, including the two new canonicalization cases. `npm audit --json`: PASS — 0 vulnerabilities across 18 dependency records. Runtime-only audit and final independent review remain pending.
- Concurrency status remains **not verified**: PGlite direct mode uses one connection. The migration's chunk-insert trigger locks the parent version row, which is the static serialization design, but no supported true two-session PostgreSQL interleaving test has run. The existing `Promise.all` approval test on direct PGlite is not two-session proof.
- Current worktree has four modified implementation/test files plus this task brief, all uncommitted. Do not claim the task complete until the remaining review and explicitly scoped concurrency acceptance decision are resolved.
- User continuation instruction for this session: do not commit, push, open a PR, merge, or apply a hosted migration.
