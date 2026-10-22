# TASK-007A PostgreSQL Day 1 Evidence — 2026-10-18

## Environment

- Host: macOS 27.0, Apple Silicon
- Node.js 22.22.3; npm 10.9.8
- PostgreSQL Server 18.6 (Homebrew); client `psql` 18.3
- Disposable cluster: `/tmp/wstera-task007a-pg.x5IaKn`, database `postgres`, port `55439`, bound only to `127.0.0.1`
- Synthetic workspaces: `ws_a`, `ws_b`
- Runtime role: `knowledge_runtime`, `LOGIN NOSUPERUSER NOBYPASSRLS`, not table owner. The migration was applied as `postgres`; runtime SQL sessions connected as `knowledge_runtime`.
- No hosted database, production credential, or external service was used.

## Reproduction

This machine's Homebrew server formula is installed but unlinked because its client binaries overlap with `libpq`. For this run, the server binaries were called from `/opt/homebrew/Cellar/postgresql@18/18.6_1/bin`; its expected shared-data paths were linked to that formula's `share/postgresql` and `lib/postgresql` directories. A fresh reproduction can use the already initialized local cluster while it exists, or initialize a new disposable cluster as follows:

1. If absent, create the expected Homebrew paths with `ln -s /opt/homebrew/Cellar/postgresql@18/18.6_1/share/postgresql /opt/homebrew/share/postgresql@18` and `ln -s /opt/homebrew/Cellar/postgresql@18/18.6_1/lib/postgresql /opt/homebrew/lib/postgresql@18`. Remove only these exact links after stopping the temporary server if you want to restore the unlinked Homebrew state.
2. Create a new cluster with `TZ=UTC /opt/homebrew/Cellar/postgresql@18/18.6_1/bin/initdb -L /opt/homebrew/Cellar/postgresql@18/18.6_1/share/postgresql -D <new-temp-dir> -U postgres --auth=trust --no-locale`.
3. Start it with `/opt/homebrew/Cellar/postgresql@18/18.6_1/bin/pg_ctl -D <new-temp-dir> -l <new-temp-dir>/server.log -o "-h 127.0.0.1 -p 55439 -F" -w start`. Do not use `brew services`.
4. Apply `platform/adapters/persistence/postgres/migrations/001-knowledge.sql` as `postgres`, then run `setup.sql` and `seed.sql` from this directory as `postgres`.
5. Run each A/B pair below in separate `psql` processes as `knowledge_runtime`. Start the first process in the background, wait one second, then start its partner. The six session SQL files deliberately hold the first transaction for six seconds. While the second process runs, query `pg_stat_activity` for its `application_name` and confirm `wait_event_type = 'Lock'`; the captured observations are `c1-wait.out`, `c2-wait.out`, and `c3-wait.out`.
6. Check the final rows with `final-state.sql`. Role/RLS configuration evidence is in `role-rls.out`; cross-workspace negative evidence is in `rls-negative.out`.

Example pair (repeat with the `c2` and `c3` file names and application names):

```sh
PGAPPNAME=c1-session-a psql -h 127.0.0.1 -p 55439 -U knowledge_runtime -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -f c1-a.sql >c1-a.out 2>&1 &
sleep 1
PGAPPNAME=c1-session-b psql -h 127.0.0.1 -p 55439 -U knowledge_runtime -d postgres -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -f c1-b.sql >c1-b.out 2>&1 &
```

## Results

| Scenario | Independent backend PIDs | Observed wait | Outcome |
|---|---:|---|---|
| C1 approve-first | A `52028`, B `52032` | B waited on `transactionid` while inserting | After A committed approval, B failed with `23514`; final version `approved`, chunk count `1`, no late chunk |
| C2 insert-first | B `52156`, A `52160` | A waited on `transactionid` while approving | B committed its chunk; A then approved; final version `approved`, chunk count `1` |
| C3 concurrent approval | A `52175`, B `52179` | B waited on `transactionid` while approving the other version | A committed; B failed with `23505` from `knowledge_one_approved_version_per_source`; final `v1=approved`, `v2=indexed`, one approved/retrievable version |

RLS negative checks ran as `knowledge_runtime` with `app.workspace_id=ws_a`: cross-workspace SELECTs on source/version/chunk tables each returned zero rows; source and version cross-workspace INSERTs failed with `42501`; source/version UPDATEs affected zero rows; the workspace B source remained active, its version remained indexed, and no forged rows existed. A cross-workspace chunk INSERT was also rejected, but its `23514` came from the earlier parent-version trigger check, so it is not counted as direct RLS INSERT evidence.

## Local verification

- `npm ci`: exit 0; installed from the existing lockfile after Owner approval.
- `npm run check`: exit 0 — typecheck/build passed; **112 tests passed, 0 failed, 0 skipped**.
- `npm audit --json`: exit 0 — 0 vulnerabilities across 18 dependency records.
- `npm audit --omit=dev --json`: exit 0 — 0 vulnerabilities across 18 dependency records.
- `git diff --check`: exit 0.
- Regression for the PostgreSQL adapter's 5,000 chunk cap: RED first (`INVALID_KNOWLEDGE_INPUT` for a valid 5,200-chunk CSV), then GREEN after raising the safe snapshot cap to 100,000; the test persists and reloads all 5,200 canonical chunks.

All SQL setup, session scripts, wait observations, and captured outputs are kept beside this report. This evidence is local-only and does not authorize commit, push, PR, merge, hosted migration, or deployment.

Independent security re-review returned **PASS WITH NOTES**, with no behavior blockers. This entire evidence directory is currently untracked; include it when assembling any later Owner-authorized candidate or PR.

## Preservation — 2026-10-23

The Owner requested local/GitHub reconciliation and PR cleanup. These 24 historical evidence files are now preserved in the consolidated candidate. Captured `.out` files are retained byte-for-byte, including psql table padding; the scoped `.gitattributes` whitespace setting preserves that format. The concurrency results above are historical evidence from 2026-10-18, not a fresh two-session run during consolidation. Independent review and Owner merge approval remain required.
