# Task 007A — Durable PostgreSQL knowledge repository

**Status:** Implementation checkpoint in progress on `codex/g1-knowledge-postgres-continuation-20261016` at `fc3d52517cbf93727e74510c24d89d3630e5e2d0` (PR #15 base `f8d8aae0fffcb09e058bc66195ce555cb865a17c`). Canonical draft validation is shared by the PostgreSQL adapter and in-memory repository. Independent review and true PostgreSQL two-session race evidence remain pending; do not claim concurrency verified.

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

## Prior checkpoint evidence — 2026-10-16

- `npm run check`: PASS — TypeScript typecheck/build and 110 tests (including 5 PGlite integration cases) in the earlier checkpoint environment; not freshly reproducible in the current checkout yet.
- `npm audit --json`: PASS — 0 vulnerabilities across 18 dependency records.
- `npm audit --omit=dev --json`: PASS — 0 vulnerabilities across 18 dependency records in the earlier checkpoint environment.
- `git diff --check`: PASS in the earlier checkpoint and rechecked in the current checkout.
- Database evidence is local PGlite only, using a non-owner, non-superuser role; no hosted database or provider was contacted.
- First independent review found that an unlocked RLS `EXISTS` could race chunk insertion against approval. A `BEFORE INSERT` trigger now locks the parent version and rejects chunks unless the version is still mutable; a regression test rejects sequential insertion after approval. `listRetrievableChunks` also returns each version with its full chunk set, and the adapter README now states the custom-GUC RLS threat boundary.
- Independent re-review is pending. PGlite direct mode is single-connection, so the current test does not prove the true two-session interleaving; use a supported PostgreSQL multi-session test substrate before claiming the race is fully verified.
- Next: finish independent security review and resolve the true two-session race verification gate. Do not claim Task 007A complete while either required acceptance item remains open. PR/commit/push steps are outside the current user's authorization.

## Working-tree follow-up — 2026-10-16

- `canonicalizeKnowledgeVersionDraft` now owns canonical rebuild/validation in the pure knowledge module. Both `InMemoryKnowledgeRepository` and `PostgresKnowledgeRepository` use it, so FAQ spans and imported page/row chunks must match the shared builder's exact segmentation, identities, offsets and locators before persistence.
- Added PostgreSQL adapter regressions that submit noncanonical FAQ and PDF chunk boundaries; both are rejected before a version row is stored.
- Earlier checkpoint reported `npm run check`: PASS — 111 tests, 0 skipped, including the two new canonicalization cases. Treat this as historical until reproduced in the current checkout.
- Concurrency status remains **not verified**: PGlite direct mode uses one connection. The migration's chunk-insert trigger locks the parent version row, which is the static serialization design, but no supported true two-session PostgreSQL interleaving test has run. The existing `Promise.all` approval test on direct PGlite is not two-session proof.
- Current worktree has four modified implementation/test files plus this task brief, all uncommitted. Do not claim the task complete until the remaining review and explicitly scoped concurrency acceptance decision are resolved.
- User continuation instruction for this session: do not commit, push, open a PR, merge, or apply a hosted migration.

## Continuation recheck — 2026-10-16

- Checkout: branch `codex/g1-knowledge-postgres-continuation-20261016`, HEAD `fc3d52517cbf93727e74510c24d89d3630e5e2d0`; the five expected working-tree files are modified and `git diff --check` passes.
- Fresh `npm run check` was attempted and failed during typecheck because this checkout lacks `csv-parse`, `pdfjs-dist`, and `@electric-sql/pglite`; the latter also causes follow-on implicit-any/type errors. Do not run `npm ci` or download dependencies without Owner authorization.
- Fresh `npm audit --json` and `npm audit --omit=dev --json` both pass with zero reported vulnerabilities across 18 lockfile dependency records.
- No `psql`, `postgres`, `initdb`, `docker`, or installed PGlite package was found in this environment. No true PostgreSQL two-session race test ran; concurrency is **not verified**.
- Independent security re-review is pending. Reproducible full checks, final re-review, and the two-session concurrency proof remain open acceptance gates; task status stays in progress.

## ChatGPT continuation — 2026-10-16, local-only

- Reconfirmed the primary checkout is on `codex/g1-knowledge-postgres-continuation-20261016`, HEAD `fc3d52517cbf93727e74510c24d89d3630e5e2d0`. All edits remain local/uncommitted.
- Found an existing sibling worktree `wstera-ai-customer-platform-g1-knowledge-postgres` with `@electric-sql/pglite@0.5.8`, `csv-parse@7.0.3`, `pdfjs-dist@6.4.299` and matching `package-lock.json` SHA. Copied the current 103 Git-tracked files to an isolated temporary directory and junction-linked only its `node_modules` to those existing dependencies. No `npm ci`, dependency download, production DB, or external provider was used.
- **Fresh isolated full check PASS**: `npm run check` -> typecheck PASS, build PASS, **111 tests PASS, 0 failed, 0 skipped**. This verifies the current source snapshot in an isolated copy; it does not claim that missing dependencies in the primary checkout were installed or that a two-session PostgreSQL test ran.
- Static review found a **false-positive risk** in the negative RLS INSERT test: it requested a `status` column not covered by runtime-role INSERT grants. A failure could come from column permissions instead of tenant row security. Fixed the local test to insert only granted columns and assert PostgreSQL SQLSTATE `42501`; also added explicit cross-workspace SELECT/UPDATE denial checks and the unchanged-status assertion. Re-copied the patched test to the isolated environment and repeated the full check: **111/111 PASS**.
- This is a local reviewer test correction, **not a completed independent security re-review**. The original adapter/migration has not been changed in this continuation; the independent re-review gate remains open.
- The Windows machine has no `psql`, `postgres`, `initdb`, `pg_ctl`, Docker or Podman binaries and no PostgreSQL service was found. PGlite integration uses one connection. **True two-session interleaving remains BLOCKED/unverified.** Do not interpret `Promise.all` on PGlite as multi-session evidence.
- No commit, push, new PR, merge, hosted migration or deployment is authorized or performed. `PR #15` is the existing model-adapter base of this task's proposed stacked PR, not a TASK-007A PR.

### Pending two-session proof (not run)

Use a separately approved *disposable local PostgreSQL* instance with two independent connections, a non-owner `NOBYPASSRLS` runtime role, the reviewed migration, grants and synthetic workspace data. Capture server/version, role, both session IDs, commands, observed blocking, SQLSTATE and final rows.

1. **Approve-first:** Session A updates an indexed version to approved within an open transaction and holds its row lock. Session B (same tenant, separate connection) attempts to insert a chunk into that version. Verify B waits for A; commit A; verify B rejects the insert and no late chunk exists.
2. **Insert-first:** Session B inserts a valid chunk into an indexed version but holds the transaction open. Session A attempts to approve that version. Verify A waits until B commits; after B commits, verify the approval observes a complete immutable chunk set, with no late mutation after approval.
3. **Two approvals:** Parallel sessions approve two different indexed versions of the same source. Verify exactly one succeeds and the partial unique index rejects the other (`23505`); verify only one version is retrievable.
4. After each scenario verify RLS, lifecycle state, chunk count and rollback; run full checks and a separate independent security re-review. Do not claim acceptance until evidence is recorded and Owner approves the next PR/merge step.
