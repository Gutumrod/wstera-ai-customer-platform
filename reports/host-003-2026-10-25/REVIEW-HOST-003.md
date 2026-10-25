# REVIEW-HOST-003 — Independent review of AICP schema isolation

**Target revision:** `codex/aicp-schema-isolation-20261025` @ `e6b83cd714a8cd07b06b42dfa27c8f3c642037af`
**Reviewer:** opencode (independent; did not write this code)
**Decision under review:** D-20261025-11

---

## สรุปสำหรับผู้คุม (ภาษาไทย)

**ผลตัดสิน: ยังไม่พร้อมรับ (CHANGES REQUIRED)** — โครงสร้างหลักย้ายเข้า schema `aicp` ถูกต้องและเทสต์เดิม
ทั้ง 176 ตัวยังผ่านโดยไม่มีการผ่อน assertion แต่มี 2 เรื่องที่ต้องแก้ก่อนรับ และ 1 เรื่องที่ต้องตัดสินใจ:

1. **HIGH — `scripts/seed-local.mjs` ยังเขียนลง `public.*`** → ขั้นตอน bootstrap ที่ README สั่งไว้ (`npm run seed:local`)
   พังทันที (ยืนยันด้วย PGlite: `42P01 relation "public.workspaces" does not exist`) และยังเป็น `public.` ที่ค้างอยู่ใน repo
   ซึ่งขัดข้อกำหนดข้อ 1 ตรง ๆ
2. **HIGH — ไม่ได้เปิด schema `aicp` ให้ PostgREST** (`supabase/config.toml:13` ยังเป็น `["public","graphql_public"]`)
   แต่ membership repo เรียก `client.schema("aicp")` → หน้า console ของผู้ใช้ที่ล็อกอินจะเรียก membership ไม่ได้
   (PostgREST ตอบ PGRST106) — unit test จับไม่ได้เพราะใช้ fake repository
3. **MEDIUM — `aicp_migrator` เป็นเจ้าของ "schema" แต่ไม่ได้เป็นเจ้าของ object ใดเลย** (ตารางทั้ง 8 ยังเป็นของ `postgres`)
   → `ALTER TABLE` ในฐานะ role ใหม่ล้มด้วย `42501` แปลว่า migration ในอนาคตยังต้องรันด้วย `postgres` อยู่ดี
   ต้องตกลงว่าเจตนาข้อกำหนดคือ "schema" หรือ "ทุก object"
4. **MEDIUM — โหมด `lab` ยังสตาร์ทไม่ได้จริง** เพราะ `createSupabaseAdminClient()` ยังบังคับ `APP_ENV === "local"`
   → URL policy รับ lab ได้ แต่ composition ตายที่ storage client ก่อน (ผู้สร้างงานระบุไว้เองใน "Remaining limitation")
5. **LOW** — local guard ไม่เหมือนเดิม 100% (URL ที่ parse ไม่ได้เปลี่ยน error จาก `TypeError` เป็น
   `LOCAL_KNOWLEDGE_DATABASE_URL_REQUIRED`), lab regex รับ ref เป็น `-` และไม่บังคับ password, ไม่มีเอกสารกล่าวถึง `aicp`

ส่วนที่ผ่าน: object ทั้งหมดอยู่ใน `aicp`, ไม่มี `public.` ใน migrations, grant ของ `knowledge_runtime` เท่าเดิม
(ไม่กว้างขึ้น, ไม่มี CREATE บน schema, ไม่มี DELETE), RLS enable/force เท่าเดิม, bucket `knowledge-originals`
ไม่เปลี่ยนแม้แต่ไบต์เดียว, ไม่มี secret/endpoint/deploy ใหม่, และ `npm run check` ผ่าน (176/176, skipped 0)

---

## 0. Acceptance plan (derived BEFORE reading tests or builder reports)

Derived solely from the five approved requirements. Each check is written so it can fail.

### Requirement 1 — schema/role isolation
- R1.1 Enumerate every `CREATE TABLE / VIEW / MATERIALIZED VIEW / FUNCTION / INDEX / POLICY / TRIGGER / TYPE / SEQUENCE / EXTENSION` in
  `supabase/migrations/**` and classify its schema qualifier. Expected: all objects `aicp.*`; zero unqualified
  objects that would default to `public`.
- R1.2 Search all SQL, TypeScript, and test fixtures for a literal `public.` object reference. Expected: none
  referencing AICP objects. `public` may only survive where Postgres/Supabase forces it (e.g. none).
- R1.3 Verify `CREATE SCHEMA aicp` exists and is owned by a *new* `aicp_migrator` role; verify that role is created
  and has the privileges needed to create in `aicp` (USAGE + CREATE on schema, ownership), otherwise the
  migration chain is not re-runnable by the intended role.
- R1.4 Verify `knowledge_runtime` grants are exactly the minimum needed and nothing more: no `CREATE` on schema,
  no ownership of tables, no `ALL`-style grant, `search_path`/default privileges do not leak into `public`.
- R1.5 Verify `search_path` handling: functions/tables that assume `public` first must not silently resolve
  to a `public` object of the same name (search_path hijack). Check `SET search_path` on security-definer functions.
- R1.6 Check for privilege gap after owner change: objects created later by a different role, `ALTER DEFAULT
  PRIVILEGES` coverage for both owner and runtime, and whether `knowledge_runtime` can still execute RLS helper
  functions after the move.

### Requirement 2 — storage bucket unchanged
- R2.1 Diff storage-related migration statements and storage policy definitions against the parent commit.
  Expected: byte-identical bucket name, visibility, and all policies on `knowledge-originals`.
- R2.2 Confirm `storage.objects` policies were not re-scoped in a way that changes who can read/write.
- R2.3 Confirm storage policies still evaluate against the moved `aicp` tables (a policy that joins to a table
  now in `aicp` must be re-qualified, not left pointing at `public`).

### Requirement 3 — host database URL policy
- R3.1 Local path byte-for-byte unchanged: obtain parent and revision implementation, diff the non-lab branch.
  Expected: identical acceptance/rejection behaviour, same error text/type.
- R3.2 Lab mode is opt-in only via `APP_ENV=lab`; absent/other values keep the old behaviour (no accidental widening).
- R3.3 Lab allowlist is closed: host must end `.pooler.supabase.com`; port ∈ {5432, 6543}; pathname exactly
  `/postgres`; user matches `knowledge_runtime.<ref>` or `postgres.<ref>`. Reject: non-pooler host, suffix-lookalike
  (`evilstuff.pooler.supabase.com` is allowed by suffix rule — evaluate intent), `pooler.supabase.com` bare,
  wrong port, `/postgres/`, `/postgres?x`, `/postgresdb`, empty, uppercase, trailing dot, user without ref,
  extra dot segments, `knowledge_runtime.<ref>.evil`.
- R3.4 No request-supplied value can choose the host: check call sites — the URL must come from env/config only,
  never from request, message, DB row, or LLM output.
- R3.5 Parse-then-validate order: validation must run on a parsed URL, not a raw string `includes()` check, and
  must fail closed on parse error. Watch for `new URL()` normalisation (userinfo, `@`, encoded chars, IPv6,
  port 0, backslashes) creating bypasses.
- R3.6 Credentials: password still required, never logged, never embedded in thrown messages.

### Requirement 4 — existing tests still hold
- R4.1 `git diff 9b4f997..e6b83cd -- '*test*' '*spec*'` — inspect every changed assertion. Classify each as
  rename-only (schema prefix), or a weakened/removed assertion. Zero deletions of property assertions.
- R4.2 Confirm the original properties are still asserted: RLS enabled+forced, cross-workspace SELECT denial,
  cross-workspace write denial, lifecycle transitions, canonical chunk rules, storage, membership.
- R4.3 Run the project's own checks and tests, capture raw output.
- R4.4 Look for test-only escape hatches: mocks that now bypass RLS, skipped tests, `test.skip`, widened
  fixtures, or assertions moved from "equals" to "contains/truthy".

### Requirement 5 — no hosted contact / secret / deploy
- R5.1 `git diff` for new credential-shaped strings (keys, tokens, `service_role`, JWT, hosts).
- R5.2 Confirm no script/default check path connects to a hosted endpoint; confirm no deploy artefacts
  (`wrangler`, `supabase db push`, CI job calling a remote DB) were added.
- R5.3 Confirm nothing in the change makes the test suite reach the network.

### Global — silent widening
- G.1 Read the full commit diff, not only files named in the requirements, and list every behavioural delta
  the requirements did not ask for.
- G.2 Check migration ordering/idempotency: re-running the chain must not fail; `IF NOT EXISTS` vs `CREATE`
  where the prior revision already created objects.

**Order chosen:** static inventory of the diff → schema/role analysis → storage delta → URL policy diff +
adversarial probes (executed) → test-diff audit → run checks → (only then) informed verification.

**Context exposure:** see section 1.

---

## 1. Context exposure during the blind pass

- Read: the commit diff (`git diff 9b4f997 e6b83cd`) for SQL, adapters, composition, tests, `package.json`.
- Read after the plan was frozen: the three changed/new test files, to audit whether assertions were relaxed.
- **Not read before section 3 was written:** `REPORT-HOST-003.md`, `REPORT-HOST-003-check-output.txt`,
  `REPORT-HOST-003-npm-ci-output.txt`, and the commit-message body.
  (`git log -1 --format='%H %ci %s'` was used, which prints the subject line only.)
- No source/test/migration file was modified. `npm run typecheck`, `npm test`, `npm run check` were run;
  `dist/` and `node_modules` were already present. Probe scripts live outside the repo in
  `C:\Users\Win11\AppData\Local\Temp\opencode\`.
- No hosted database, provider, or network endpoint was contacted. All database probes ran on embedded
  PGlite (the same engine the project's own tests use).

---

## 2. Findings (blind pass — ranked by impact)

### F-01 — HIGH — `scripts/seed-local.mjs` still writes to `public.*`; the documented local bootstrap is broken

`scripts/seed-local.mjs` was **not** touched by this commit and still contains three writes to the
dropped schema:

```
scripts/seed-local.mjs:57:      INSERT INTO public.workspaces (workspace_id, name, status)
scripts/seed-local.mjs:62:      INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
scripts/seed-local.mjs:67:      INSERT INTO public.workspace_connections (workspace_id, connection_id, channel, status)
```

Reproduced against the reviewed migrations (PGlite, full `20261022` + `20261023` chain):

```
### seed script target (public.workspaces): FAILED -> 42P01 relation "public.workspaces" does not exist
```

Impact: requirement 1 ("the `public` schema must not be used") is not met — a `public.` object write
survives in the repository — and requirement 4's operational intent breaks: `README.md:61` still tells the
operator to run `npm run seed:local`, which now aborts on its first statement, so no synthetic owner,
membership, or web connection is created and the console login path has no workspace to resolve.
The "public has no tables" assertion added to the migration test cannot catch this, because the seed
script is not exercised by any test.

### F-02 — HIGH — `aicp` is not exposed to PostgREST, so `client.schema("aicp")` fails at runtime

The membership adapter was changed to use the new schema:

```
platform/adapters/persistence/supabase/workspace-membership-repository.ts:9:  const schema = this.client.schema("aicp");
platform/adapters/persistence/supabase/workspace-membership-repository.ts:10: const membershipsResponse = await schema.from("workspace_memberships")
platform/adapters/persistence/supabase/workspace-membership-repository.ts:19: const connectionsResponse = await schema.from("workspace_connections")
```

but `supabase/config.toml` was not changed and still exposes only the default schemas:

```
supabase/config.toml:13:schemas = ["public", "graphql_public"]
supabase/config.toml:15:extra_search_path = ["public", "extensions"]
```

`git diff --name-status 9b4f997 e6b83cd` confirms `supabase/config.toml` is absent from the change.
The CLI maps `[api] schemas` to PostgREST `PGRST_DB_SCHEMAS`; a request with `Accept-Profile: aicp`
against a schema outside that list is rejected (`PGRST106`, message listing the allowed schemas), and
`supabase-js .schema()` has no fallback. The consequence is that merchant login → membership listing →
workspace selection fails closed *and unusable*, even though `GRANT USAGE ON SCHEMA aicp TO authenticated`
is in place — the grant is necessary but not sufficient.

This seam is invisible to the test suite: `merchant-identity.test.ts` drives a fake repository and the
migration test talks to PostgreSQL directly, so nothing exercises PostgREST schema exposure.
Confidence is high from configuration alone; it is **not** reproduced live (no Supabase stack was started —
see untested areas).

### F-03 — MEDIUM — `aicp_migrator` owns the schema but none of the objects, so the new owner cannot migrate

The role is created in the *second* migration, after every table already exists:
`supabase/migrations/20261023000100_g1_workspace_host.sql:71-81` (`DO`/`ALTER ROLE`/`ALTER SCHEMA aicp OWNER TO aicp_migrator`),
while the objects are created earlier in `20261022000100_knowledge.sql` and immediately above in the same file.

Measured state after applying both migrations:

```
### table owners        all 8 aicp tables -> "tableowner": "postgres"
### schema owners       { "nspname": "aicp", "owner": "aicp_migrator" }
### aicp_migrator ALTER on aicp.knowledge_sources: FAILED -> 42501 must be owner of table knowledge_sources
### aicp_migrator CREATE TABLE in aicp: OK
```

So requirement 1's "owned by a new `aicp_migrator` role" holds for the **schema** only, at schema granularity
(which is what the new test asserts). Concretely: the role can create *new* objects in `aicp` but cannot
`ALTER`/`DROP`/`GRANT` on any existing `aicp` table or function, and it is `NOLOGIN` with no role memberships,
so migrations still run as `postgres`. If the intent was "future migrations run as `aicp_migrator`", that
intent is not implemented; the role is currently a marker. See ambiguity A-1.

### F-04 — LOW — the local guard is not byte-for-byte identical (error type changed for unparsable URLs)

Before (`9b4f997:platform/composition/merchant-knowledge-host.ts:10-18`) an unparsable `DATABASE_URL`
propagated `TypeError [ERR_INVALID_URL]` from `new URL(value)`. After
(`platform/composition/knowledge-database-url.ts:14-19`) it is caught and converted:

```
local garbage   -> REJECT Error: LOCAL_KNOWLEDGE_DATABASE_URL_REQUIRED
                   (old code: TypeError ERR_INVALID_URL)
```

Both fail closed, and every *acceptance/rejection decision* for parseable URLs is unchanged
(same host allowlist `127.0.0.1`/`localhost`/`[::1]`, same port `54322`, same `knowledge_runtime` user,
same `LOCAL_DATABASE_URL_REQUIRED` when `APP_ENV !== "local"` or the value is empty). The deviation is
limited to the error identity for malformed input, so it contradicts requirement 3's "exactly as before"
in a narrow, non-security way. No test pins the old behaviour, so the change is unpinned either way.

### F-05 — LOW — lab allowlist is looser than the requirement's wording in three places

Probed the compiled artefact (`node dist/composition/knowledge-database-url.js`):

| probe | result |
|---|---|
| `postgresql://postgres.-:pw@aws-0.pooler.supabase.com:5432/postgres` | **ACCEPT** |
| `postgresql://knowledge_runtime.ref@aws-0.pooler.supabase.com:5432/postgres` (no password) | **ACCEPT** |
| `postgresql://knowledge_runtime.ref:pw@aws-0.pooler.supabase.com:5432/postgres?sslmode=disable` | **ACCEPT** |
| `postgresql://knowledge_runtime.ref:pw@evilstuff.pooler.supabase.com:5432/postgres` | **ACCEPT** |
| `…@pooler.supabase.com:5432/postgres` (bare) | REJECT |
| `…@pooler.supabase.com.evil:5432/postgres` | REJECT |
| `…@aws-0.pooler.supabase.com.:5432/postgres` (trailing dot) | REJECT |
| `…@AWS-0.POOLER.SUPABASE.COM:5432/postgres` | REJECT (Node does not lowercase non-special schemes) |
| `…@aws-0.pooler.supabase.com/postgres` (no port) / `:0` / `:5433` | REJECT |
| `/postgres/` / `/POSTGRES` / `/other` | REJECT |
| `http://…` | REJECT |

- `[A-Za-z0-9-]+` for `<ref>` accepts `-` (and `postgres.-`), whereas a Supabase project ref is lower-case
  alphanumeric; `knowledge_runtime.ref` is also allowed to differ from the host's project ref.
- No non-empty-password requirement (the requirement does not mention a password; the connection would
  simply fail, so impact is diagnostic noise, not access).
- A query string is ignored, so `?sslmode=disable` is accepted in lab mode — the requirement constrains
  only host/port/path/user, so this is within the letter but is a transport weakening worth an explicit ruling.
- Any subdomain of `pooler.supabase.com` is accepted (e.g. `evilstuff.…`). That follows the requirement's
  literal "hosts ending `.pooler.supabase.com`", and the domain is Supabase-controlled, so risk is low —
  but it is a suffix rule, not a project-pinned rule.

### F-06 — LOW — the schema move is undocumented for operators

`grep -rln "aicp" --include=*.md .` returns only the builder report and this review; `README.md` and
`architecture/*.md` never mention `aicp`. `README.md:36` still describes `supabase/migrations/` as
"workspace membership, private knowledge storage and runtime database role" with no schema statement, and
`README.md:58-61` still describes a local flow that now breaks at step 5 (F-01). Anything an operator would
need for psql triage (`SET search_path`, `aicp.` prefixes) is absent.

---

## 3. Checks that passed

### R1 — schema/role isolation (apart from F-01/F-03)

Object inventory after applying both migrations on PGlite — **no relation lands in `public`**:

```
aicp: knowledge_chunks, knowledge_original_objects, knowledge_quarantine_records,
      knowledge_sources, knowledge_versions, workspace_connections, workspace_memberships, workspaces
auth: users, storage: buckets, objects (test fixtures only)
```

Routines: `aicp.guard_knowledge_chunk_insert`, `aicp.is_active_workspace_member` (security definer,
`SET search_path = pg_catalog, aicp`), `aicp.protect_knowledge_version_identity`. All qualified.

`grep -rn "public\." supabase/migrations/ platform/adapters/persistence/postgres/migrations/` → no matches.
Every `CREATE TABLE/INDEX/POLICY/TRIGGER/FUNCTION` in both migrations carries the `aicp.` qualifier; the
`EXISTS` sub-selects inside the chunk policy and both trigger bodies are re-qualified too, so nothing
resolves through `search_path` into `public`.

Privilege surface for `knowledge_runtime` is **identical to the parent grant set** (moved, not widened):

```
usage_aicp: true, create_aicp: false,
chunks_select: true, chunks_insert: true, chunks_update: false, chunks_delete: false,
versions_delete: false, sources_delete: false, workspaces_select: false,
member_fn_exec: false, member_fn_auth_exec: true
anon_usage: false, anon_select: false
default ACLs: none
```

No `ALTER DEFAULT PRIVILEGES` was added, so new objects stay closed by default rather than inheriting grants.
`aicp_migrator` is `NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT` with no
memberships, and `assertLeastPrivilege()` (`pg-database.ts:36-43`) still rejects any runtime role with
memberships, `BYPASSRLS`, or a non-`knowledge_runtime` name.

### R2 — storage unchanged

`git diff 9b4f997 e6b83cd -- platform/adapters/storage/` → empty. The bucket statement is byte-identical
(`g1_workspace_host.sql:142-146`: id/name `knowledge-originals`, `public = false`, 5 242 880-byte limit,
same MIME list). No `storage.objects` policy exists either before or after, and the storage assertions in
`workspace-host-migration.test.ts:114-133` (private originals invisible/undeletable to `authenticated`,
cross-workspace denial) are unchanged and pass.

### R3 — URL policy (behaviour verified, caveats in F-04/F-05)

Local: identical accept/reject logic and identical error strings for every parseable input; `APP_ENV`
values other than `local`/`lab` still fail with `LOCAL_DATABASE_URL_REQUIRED`; missing value still fails.
Lab: parse-first, then validate protocol/host/port/path/user, all failures collapse to one error code
(fail closed). No request-derived input reaches it — the sole caller is
`merchant-knowledge-host.ts:14`, and `grep "new PgPostgresDatabase"` returns only that line, so the host is
always chosen by `DATABASE_URL` + `APP_ENV` from the environment.

### R4 — existing tests

`git diff --diff-filter=D --name-only` → empty (no test file deleted).
`git diff 9b4f997 e6b83cd -- '*test.ts' | grep -E "^-.*(assert|rejects|throws|deepEqual|equal)"` → **no output**:
not one assertion line was removed. All test edits are `public.` → `aicp.` renames plus additions:

```
+ assert.deepEqual(publicTables.rows, [], "product migrations must leave public without tables");
+ assert.deepEqual(migrator.rows[0], {... rolcanlogin: false});
+ assert.deepEqual(schemaOwner.rows[0], { owner: "aicp_migrator" });
```

`package.json`'s test list gained `workspace-host-migration.test.js` and `knowledge-database-url.test.js`;
set-diff of the lists shows additions only. No `test.skip`/`todo` anywhere in `platform/**/*.test.ts`.

Project gate, run by the reviewer:

```
$ npm run typecheck      -> exit 0
$ npm test               -> tests 176, pass 176, fail 0, skipped 0, todo 0
$ npm run check          -> exit 0, tests 176 / pass 176 / fail 0 / skipped 0
```

The properties the requirements name are still asserted: RLS cross-workspace read (`unscoped`, `forgedRead`),
cross-workspace write (`forgedUpdate`, forged insert rejected), lifecycle/transition guards, canonical chunk
and locator rules, storage privacy, and membership resolution including the suspended-workspace case.

### R5 — secrets / hosted contact / deploy

`git diff … | grep -inE "eyJ|sk-|service_role|password|token|api[_-]?key|https://|fetch\(|wrangler|db push"`
on all changed files except the three `REPORT-*` files returns only synthetic fixtures
(`…:synthetic@aws-0-ap-southeast-1.pooler.supabase.com…`). No dependency was added
(`package-lock.json` is not in the change set), no CI/deploy file changed, no `.env` file changed, and the
new test calls the pure function only — nothing opens a socket. All reviewer database work used PGlite.

### Global — silent widening

Full diff reviewed; the behavioural deltas beyond the five requirements are: the extra `aicp_migrator` role
and ownership transfer (required in spirit), the `public`-empty and role/owner assertions (tests only), and
the error-type change in F-04. No API surface, no dependency, no new env var contract beyond `APP_ENV=lab`,
and no relaxation of any RLS predicate, grant list, or validation rule.

---

## 4. Informed verification (read AFTER section 2 was written)

Read at this point: `REPORT-HOST-003.md`, `REPORT-HOST-003-check-output.txt`,
`REPORT-HOST-003-npm-ci-output.txt`, and `git log -1 --format=%B` (the commit body is empty — subject only).
Nothing in section 2 was revised on the basis of these; the additions below are evidence found *while*
checking the builder's claims.

### 4.1 New finding from the builder's own disclosure — F-07 (MEDIUM): lab mode is unreachable in the composition

`REPORT-HOST-003.md:33-35` states the wider host composition still requires `APP_ENV=local` for storage.
Verified independently:

```
platform/apps/merchant-console/lib/supabase/admin.ts:8:
  if (process.env.APP_ENV !== "local" || !url || !secretKey) throw new Error("LOCAL_SUPABASE_SERVER_SECRET_REQUIRED");
platform/composition/merchant-knowledge-host.ts:13-20:
  const database = shared.__merchantKnowledgeDatabase ?? new PgPostgresDatabase(requiredKnowledgeDatabaseUrl());
  ...
  storage: new SupabasePrivateKnowledgeStorage(createSupabaseAdminClient()),
```

So with `APP_ENV=lab` and a valid pooler `DATABASE_URL`, the URL policy now *accepts* the value and then
`createSupabaseAdminClient()` throws `LOCAL_SUPABASE_SERVER_SECRET_REQUIRED` moments later inside the same
function. Net effect: the lab branch added by this change has no reachable caller path — it is only exercised
by the new unit test. No test constructs `createMerchantKnowledgeHost` under `APP_ENV=lab`.

Assessment: requirement 3 is satisfied literally (the *policy* accepts lab URLs) and failing closed is the safe
direction, so this is not a security regression. But the change ships a policy whose only consumer cannot start,
and the report presents it as complete except for "a full LAB host startup remains unverified". A reviewer
signing off should know the lab path is currently dead code, not merely unverified.

### 4.2 Cross-check of builder claims

| Claim in `REPORT-HOST-003.md` | Reviewer result |
|---|---|
| `npm ci` exit 0, 0 vulnerabilities | Not re-run (dependency-free change; `package-lock.json` untouched). Not material to the requirements. |
| `npm run check` exit 0, 176 pass / 0 fail / 0 skipped | **Reproduced independently**: same counts, exit 0. |
| "`rg -n 'public\.' supabase/migrations` — no matches" | **True but too narrow.** The command is scoped to `supabase/migrations`, which is exactly why F-01 escaped: `scripts/seed-local.mjs` sits outside that path and still holds three `public.` writes. Requirement 1 says the `public` schema must not be used, not "must not appear in migrations". |
| "preserves the `knowledge_runtime` grants pattern" | Confirmed — identical grant set, moved only. |
| "adds idempotent restricted `aicp_migrator`, transfers schema ownership" | Confirmed, and accurate in wording: *schema* ownership is transferred; object ownership is not (F-03). |
| "retain the prior lifecycle, RLS, grants, storage, tenant isolation and canonical locator assertions" | Confirmed — zero assertion lines removed; additions only. |
| "No hosted database was queried or modified" | Consistent with the diff; nothing in the change can reach a hosted endpoint at build/test time. |

The report does not mention `supabase/config.toml` (F-02), `scripts/seed-local.mjs` (F-01), or table-level
ownership (F-03). All three are absent from its "Files changed" and "Remaining limitation" sections.

---

## 5. Untested areas (what this review did NOT prove)

- **PostgREST schema exposure (F-02).** Not reproduced against a running stack (would need the local Supabase
  Docker stack). The conclusion rests on `supabase/config.toml:13` plus PostgREST `db-schemas` semantics.
- **Hosted pooler connection.** Forbidden by the write scope; the lab URL path was never dialled.
- **Transaction pooler (port 6543) semantics.** `set_config('app.workspace_id', $1, true)` is transaction-local,
  which is the safe form under PgBouncer transaction pooling, but nothing verifies RLS scoping through a real
  pooler, and the `pg` pool (max 4) behaviour through a pooler is unexamined.
- **Applying the migration chain to an existing populated database.** All probes used a fresh PGlite instance;
  `ALTER SCHEMA … OWNER TO` over existing data was not exercised.
- **`supabase db reset --local` end to end**, and a full `npm run seed:local` run. F-01 was proven by executing
  the seed's first statement, not by running the script (it needs Docker, a local auth server and credentials).
- **RLS through the real JWT/PostgREST path.** RLS was verified via `SET LOCAL ROLE` in PGlite, as the project's
  existing tests already do.
- **Migration run *as* `aicp_migrator`.** The role is `NOLOGIN` with no memberships, so "future migrations owned
  by the new role" could not be exercised — there is no way to log in as it.

---

## 6. Requirement ambiguities

- **A-1 — "owned by a new `aicp_migrator` role" (req. 1).** Two readings: (a) the `aicp` schema is owned by the
  role, or (b) every object is owned by it. The change implements (a) and the new test asserts only (a); objects
  remain owned by `postgres` (F-03). If the Owner meant (b) — or meant "future migrations can run as this role" —
  the change does not satisfy it, and `ALTER SCHEMA … OWNER` should be accompanied by `ALTER TABLE … OWNER TO`
  (or `REASSIGN OWNED`) for all existing objects.
- **A-2 — "new role" vs. ordering.** The role is created idempotently and the ownership transfer is re-runnable,
  which is good; but the schema itself is created in the *earlier* migration
  (`20261022000100_knowledge.sql:1`) without `AUTHORIZATION`, so ownership is only corrected one migration later.
  If the intent is "never owned by `postgres`, even transiently", that ordering needs a decision.
- **A-3 — "`knowledge_runtime` keeps only the grants it needs" (req. 1).** The grant list is byte-for-byte the
  parent's (moved, not reduced). "Keeps" is satisfied; "only what it needs" was not re-derived, so if the intent
  was a privilege review (e.g. whether `INSERT` on `knowledge_chunks` is still required), that review did not happen.
- **A-4 — "the `public` schema must not be used" (req. 1).** Scope is unclear: migrations only, or the whole
  repository? Implemented as "migrations only" (and the builder's verification command reflects that), which is
  why `scripts/seed-local.mjs` was left behind. The stricter reading is the one that matches the words.
- **A-5 — lab user `<ref>` (req. 3).** Whether `<ref>` must equal the host's project ref is not stated; the
  implementation does not tie them (F-05). Whether an empty password or `?sslmode=disable` should be accepted in
  lab mode is likewise unspecified.
- **A-6 — "local guard exactly as before" (req. 3).** Whether "as before" covers the *error identity* for
  unparsable input (F-04) or only the accept/reject decision is unspecified. Both readings are defensible; the
  change alters the former and preserves the latter.

---

## 7. Verdict

**CHANGES REQUIRED before this is accepted as AICP-HOST-003.**

Blocking:
- **F-01** — `scripts/seed-local.mjs` must target `aicp`. This is requirement 1 as written, and in practice it
  breaks the documented local bootstrap (`README.md:61`).
- **F-02** — `aicp` must be exposed to the API layer (`supabase/config.toml` `[api] schemas`, plus
  `extra_search_path` if unqualified function resolution is expected), otherwise the membership adapter is
  dead on arrival on the console's authenticated path.

Requires an Owner ruling (not necessarily a code change):
- **F-03 / A-1** — object-level vs schema-level ownership, and whether `aicp_migrator` is meant to run future
  migrations.
- **A-4** — the scope of "the `public` schema must not be used".

Accepted as-is, with notes:
- **F-04, F-05, F-06, F-07** — inside the letter of the requirements, or gaps the builder disclosed; none widen
  access, leak a credential, or weaken a test.

What is genuinely good here: the schema relocation is complete and internally consistent (relations, foreign
keys, indexes, triggers, policies, trigger bodies, and the security-definer `search_path` all re-qualified), the
runtime grant set was not widened, RLS enable/force flags are unchanged, the storage bucket definition is
untouched, no test assertion was relaxed, and the role guardrails (`NOBYPASSRLS`, `NOINHERIT`, no memberships,
`assertLeastPrivilege`) are intact. The 176-test gate passes on a clean `npm run check`.

DONE
