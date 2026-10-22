# Task 007A — Durable PostgreSQL knowledge repository

**Status (2026-10-23):** Existing local follow-up and 2026-10-18 synthetic PostgreSQL evidence are preserved in `codex/pr-consolidation-20261023`. Fresh local checks are recorded in the reconciliation report. Historical no-commit/no-push restrictions below describe the earlier continuation; the Owner has since requested repository/PR cleanup. The consolidated candidate still requires independent review and Owner merge approval; no deployment or hosted migration is authorized.

**History:** The sections below retain their original checkpoint dates. Historical two-session/reviewer claims are not a new verification performed during PR consolidation.

## Current state

The G1 knowledge module and extractor can create, approve, revoke and retrieve FAQ/PDF/CSV versions. This task implements the PostgreSQL persistence half, including local database-level RLS/lifecycle tests and separate real-PostgreSQL concurrency evidence. There is still no authenticated upload host or production connection pool; those remain separate work.

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

### Two-session proof — pending at the 2026-10-16 checkpoint; completed 2026-10-18

The following proof was run against a disposable local PostgreSQL 18.6 instance on 2026-10-18. It supersedes the 2026-10-16 “not run” status above. Full SQL, wait observations and outputs are stored in `tasks/evidence/task-007a-postgres-day1-2026-10-18/`.

1. **C1 approve-first — PASS:** Session A PID `52028` held the approval transaction while session B PID `52032` blocked on a `transactionid` lock inserting a late chunk. After A committed, B failed with `23514`; final state was approved with one chunk.
2. **C2 insert-first — PASS:** Session B PID `52156` held an inserted chunk while session A PID `52160` blocked on a `transactionid` lock approving the version. After B committed, A approved; final state was approved with one complete chunk.
3. **C3 concurrent approval — PASS:** Sessions A/B PIDs `52175`/`52179` attempted approval of separate versions for the same source. B blocked, then failed with `23505` at `knowledge_one_approved_version_per_source`; final state had one approved/retrievable version (`v1`) and `v2` remained indexed.
4. **RLS — PASS:** Runtime role `knowledge_runtime` was `NOSUPERUSER NOBYPASSRLS`, distinct from the `postgres` table owner. All three tenant tables had RLS enabled and forced. With `app.workspace_id=ws_a`, cross-workspace SELECTs returned zero rows; source/version INSERTs failed with `42501`; source/version UPDATEs affected zero rows and no forged rows remained. A chunk INSERT attempt was rejected by its parent-version trigger with `23514` before the RLS check; it is not counted as direct RLS INSERT evidence.
5. Final database state and independent re-review are recorded in the evidence directory. The static review and PostgreSQL two-session proof passed; the independent reviewer returned **PASS WITH NOTES** and found no behavior blockers. Do not commit, push, open a PR, merge, migrate a hosted database or deploy in this continuation.

## Day 1 execution evidence — 2026-10-18

- **Environment:** macOS 27.0 arm64; Node.js 22.22.3; npm 10.9.8; PostgreSQL Server 18.6 (Homebrew), client `psql` 18.3. The disposable cluster bound only to `127.0.0.1:55439`; no hosted database or production credential was used.
- **Dependencies:** Owner approved `npm ci`; it exited 0 from the lockfile. `package-lock.json` did not change.
- **Checks:** `npm run check` PASS — typecheck and build passed, **112 tests passed, 0 failed, 0 skipped**. `npm audit --json` and `npm audit --omit=dev --json` each exited 0 with 0 vulnerabilities across 18 dependency records. `git diff --check` exited 0.
- **Reviewer finding fixed:** `snapshotVersionDraft` capped chunks at 5,000 even though valid imported content can produce more. Added a regression that failed first with `INVALID_KNOWLEDGE_INPUT`, then raised the bounded snapshot cap to 100,000; the valid canonical CSV creates, persists and reloads 5,200 chunks.
- **Independent review:** Initial review found a chunk-bound mismatch and evidence drift in this task record. The code finding is fixed and the record now matches current evidence. Final read-only re-review: **PASS WITH NOTES**; no behavior blockers in tenant isolation, RLS, parameter binding, transaction atomicity, lock ordering, immutable lifecycle, identity/citations or error handling.
- **Evidence files:** `tasks/evidence/task-007a-postgres-day1-2026-10-18/` contains the migration setup grants, synthetic seed SQL, C1–C3 session SQL, lock wait observations, RLS negative checks, final state query and captured outputs.
- **Remaining scope:** There is no host connection pool, authenticated upload path, role provisioning for a deployed host, or approved PR. These remain separate tasks or Owner decisions; no commit, push, PR, merge, hosted migration or deployment was done.
