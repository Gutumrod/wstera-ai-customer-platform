# VERIFY-HOST-003 — Informed verification (fix round)

**รอบการตรวจ:** informed verification (รอบที่ 2 — ไม่ใช่ blind QA)
**Target:** `codex/aicp-schema-isolation-20261025` @ `e1233830f1528ee72dac48586c5557cb9dd4be64`
**Baseline ที่ใช้เทียบ:** `e6b83cd` (blind pass เดิม) และ `9b4f997` (parent ของ local guard)
**ผู้ตรวจ:** opencode (ไม่ได้เขียนโค้ดชุดนี้)
**Decision:** D-20261025-11
**วันที่:** 2026-10-25

---

## 0. ขอบเขตและวิธีตรวจ (informed)

รอบนี้ **อ่านได้ทั้ง** `REVIEW-HOST-003.md` (ผล blind pass ของตัวเอง) และ `REPORT-HOST-003-FIX.md`
(รายงานผู้สร้าง) แล้ว **ไม่เชื่อรายงาน** — ทุกข้อสรุปด้านล่างมาจากการรันคำสั่งเองและวัดผลจริง

**การปฏิบัติตาม STOP rules**

- เขียนเฉพาะไฟล์นี้ (`VERIFY-HOST-003.md`) — ไม่ได้แก้ source / test / migration / config แม้แต่ชั่วคราว
  (`git status` ก่อนเริ่มมีแค่ `?? REVIEW-HOST-003.md`; หลังเขียนรายงานนี้มี `?? VERIFY-HOST-003.md` เพิ่ม)
- probe ทุกตัวอยู่ **นอก repo**: `C:\Users\Win11\AppData\Local\Temp\opencode\verify-host003\`
  (`probe-schema.mjs`, `probe-privileges.mjs`, `probe-url.mjs`, `probe-final.mjs`, `check.log`)
- **ไม่ได้** ต่อ hosted database / deploy / เรียก provider / push / merge — ฐานข้อมูลที่ใช้คือ PGlite
  (engine เดียวกับที่ test ของโปรเจกต์ใช้) และการอ่านไฟล์ในเครื่อง
- ไม่ได้แก้ defect ใด ๆ — รายงานอย่างเดียว

**ชุด diff ที่ตรวจ:** `git diff --name-status e6b83cd e123383` → 8 ไฟล์

```
M README.md
A REPORT-HOST-003-FIX.md
M platform/adapters/persistence/supabase/workspace-host-migration.test.ts
M platform/composition/knowledge-database-url.test.ts
M platform/composition/knowledge-database-url.ts
M scripts/seed-local.mjs
M supabase/config.toml
M supabase/migrations/20261023000100_g1_workspace_host.sql
```

Gate ของโปรเจกต์ (รันเอง, ผลดิบเก็บที่ `check.log`):

```
$ npm run check
CHECK_EXIT=0
ℹ tests 176   ℹ pass 176   ℹ fail 0   ℹ skipped 0   ℹ todo 0
```

---

## 1. ผลตัดสินราย finding

| ID | Severity เดิม | Verdict | หลักฐานยืนยัน (คำสั่ง → ผล) |
|---|---|---|---|
| **F-01** seed เขียน `public.*` | HIGH | **CLOSED** | `git grep -n -E 'public\.(workspaces\|workspace_memberships\|workspace_connections\|knowledge_sources\|knowledge_versions\|knowledge_chunks\|knowledge_original_objects\|knowledge_quarantine_records)'` → **ไม่มีผลลัพธ์ (exit 1)**; `sed -n '57p' scripts/seed-local.mjs` → `INSERT INTO aicp.workspaces`; รัน 3 statement ของ seed (คัดลอกมาจากไฟล์จริง) บน PGlite ที่ apply migration ชุด fix → `OK (twice, idempotent)` ทั้ง 3 และ join ได้ 1 แถว `synthetic-shop / owner / web` |
| **F-02 `aicp` ไม่ถูก expose ให้ API** | HIGH | **CLOSED** (ระดับ config; runtime ยังไม่พิสูจน์) | `supabase/config.toml:13` → `schemas = ["public", "graphql_public", "aicp"]`, `:15` → `extra_search_path = ["public", "extensions", "aicp"]`; PGlite: `has_schema_privilege('authenticated','aicp','USAGE') = true` และ `authenticated` อ่าน 3 ตาราง workspace ได้จริง (ดูข้อ 2) — path ที่ใช้คือ `createSupabaseServerClient()` → `.schema("aicp")` (`identity.ts:11-15`, `workspace-membership-repository.ts:9`) |
| **F-03 `aicp_migrator` ไม่ได้เป็นเจ้าของ object** | MEDIUM | **CLOSED** | PGlite: `SELECT DISTINCT rolname ... relkind IN ('r','p','i','S','c')` → `[{"owner":"aicp_migrator"}]` (เดิม `e6b83cd` → `[{"owner":"postgres"}]`); relation 23 รายการ (8 ตาราง + 15 index) และ function 3 ตัว owner = `aicp_migrator` ทั้งหมด; `SET ROLE aicp_migrator; ALTER TABLE aicp.knowledge_sources ADD COLUMN ...` → **OK** (เดิม `42501`), `GRANT ... ON aicp.knowledge_versions` → **OK** |
| **F-04 local guard เปลี่ยน error** | LOW | **CLOSED** | `node probe-url.mjs` ยิงใส่ `dist/composition/knowledge-database-url.js`: `"not a URL"` + `APP_ENV=local` → `TypeError: Invalid URL` (ตรงกับ `9b4f997` ที่ปล่อย `new URL()` หลุดออกมา); URL ที่ parse ได้ทุกกรณีผล accept/reject และข้อความ error เหมือนเดิมทุกตัว (`LOCAL_DATABASE_URL_REQUIRED` / `LOCAL_KNOWLEDGE_DATABASE_URL_REQUIRED`); มี test pin พฤติกรรมนี้ (`assert.throws(..., TypeError)`) และรันแยกไฟล์ผ่าน 1/1 |
| **F-05 lab allowlist หลวมกว่า requirement** | LOW | **PARTIAL** | แก้แล้ว 2 จาก 4 จุด: `postgres.-` → REJECT, ref สั้น/พิมพ์ใหญ่ → REJECT, ไม่มี password/รหัสว่าง → REJECT (เดิม ACCEPT). **ยังเหลือ:** `knowledge_runtime.abcdefghijklmnopqrst:pw@evilstuff.pooler.supabase.com:5432/postgres` → **ACCEPT**; `?sslmode=disable` → ACCEPT; `#frag` → ACCEPT; ref ไม่ผูกกับ project ref ของ host (`aws-0` + ref อะไรก็ได้) → ACCEPT |
| **F-06 ไม่มีเอกสาร operator** | LOW | **CLOSED** | `README.md` มี section ใหม่ “Database operator note” ระบุ `aicp`, `aicp_migrator`, `knowledge_runtime`, “product migrations leave the `public` schema empty” และคำสั่งให้ operator ไปเพิ่ม `aicp` ใน exposed API schemas เมื่อมี hosted project ที่ได้รับอนุมัติแยก |
| **F-07 lab mode เอาไปใช้จริงไม่ได้** | MEDIUM | **OPEN** (documented + re-scoped) | ไม่มีโค้ดแก้: `platform/apps/merchant-console/lib/supabase/admin.ts:8` ยังเป็น `if (process.env.APP_ENV !== "local" ...) throw new Error("LOCAL_SUPABASE_SERVER_SECRET_REQUIRED")`; test ใหม่ (`knowledge-database-url.test.ts`) **ยืนยันว่า lab ยังล้มด้วย error นี้** (รันไฟล์เดียว → `pass 1/1`) คือ “pin พฤติกรรมที่ยังเสีย” ไม่ใช่การแก้ |

**สรุปสั้น:** 6 จาก 7 finding ปิดแล้ว (F-05 ปิดบางส่วน, F-07 ยังเปิดโดยเจตนาและถูกส่งต่อไป HOST-004)

---

## 2. หลักฐานสำคัญที่วัดเอง (ไม่ใช่คำกล่าวอ้างในรายงาน)

### 2.1 Ownership หลังแก้ (F-03)

```
HEAD  DISTINCT aicp owner set : [{"owner":"aicp_migrator"}]
PARENT DISTINCT aicp owner set: [{"owner":"postgres"}]
HEAD function owners:
  guard_knowledge_chunk_insert      owner=aicp_migrator prosecdef=false
  is_active_workspace_member        owner=aicp_migrator prosecdef=true  search_path=pg_catalog, aicp
  protect_knowledge_version_identity owner=aicp_migrator prosecdef=false
aicp_migrator ALTER TABLE aicp.knowledge_sources: "OK"
aicp_migrator GRANT on aicp.knowledge_versions:   "OK"
```

### 2.2 ไม่มี grant/RLS ของ runtime เปลี่ยน (regression หลักที่ต้องเฝ้า)

เทียบ matrix `has_table_privilege` ของ `knowledge_runtime`, `authenticated`, `anon` และ flag
`relrowsecurity/relforcerowsecurity` ครบทั้ง 8 ตาราง ระหว่าง `e6b83cd` → `e123383`:

```
GRANT/RLS DIFF parent -> head (roles: knowledge_runtime, authenticated, anon):
  []   <-- ไม่มีความต่างเลย
```

ความต่างเดียวที่เจอคือ `aicp_migrator` ได้สิทธิ์ทั้งหมดบน 8 ตาราง — ซึ่งเป็น **ผลของ ownership**
ตามธรรมชาติ ไม่ใช่ grant ที่เพิ่มให้ runtime (ไม่มี `GRANT` ใหม่ให้ `knowledge_runtime`/`authenticated`)

Probe สิทธิ์แบบแยก transaction ต่อคำสั่ง (HEAD กับ PARENT ได้ผลเหมือนกันทุกข้อ):

```
knowledge_runtime DELETE knowledge_chunks     : DENIED 42501   (PARENT: DENIED 42501)
knowledge_runtime DELETE knowledge_versions   : DENIED 42501   (PARENT: DENIED 42501)
knowledge_runtime CREATE TABLE in aicp        : DENIED 42501   (PARENT: DENIED 42501)
knowledge_runtime SELECT aicp.workspaces      : DENIED 42501   (PARENT: DENIED 42501)
knowledge_runtime TRUNCATE chunks             : DENIED 42501   (PARENT: DENIED 42501)
authenticated SELECT knowledge_versions       : DENIED 42501   (PARENT: DENIED 42501)
authenticated INSERT knowledge_sources        : DENIED 42501   (PARENT: DENIED 42501)
authenticated INSERT workspace_connections    : DENIED 42501   (PARENT: DENIED 42501)
authenticated UPDATE workspace_memberships    : DENIED 42501   (PARENT: DENIED 42501)
authenticated SELECT auth.users               : DENIED 42501   (PARENT: DENIED 42501)
anon SELECT aicp.workspaces                   : DENIED 42501   (PARENT: DENIED 42501)
```

RLS: `knowledge_*` ทั้ง 5 ตาราง enabled+**forced** เหมือนเดิม, ตาราง workspace ทั้ง 3 enabled ไม่ forced
เหมือนเดิม; policy ทั้งชุด (`pg_policy` + `polqual`) เทียบ parent → `IDENTICAL`; `pg_default_acl` = `[]`
(ไม่มี default privilege ใหม่ที่ทำให้ object ในอนาคตถูกเปิดอัตโนมัติ)

### 2.3 membership ยังทำงานหลังย้าย owner ของ SECURITY DEFINER function

`is_active_workspace_member` เปลี่ยน owner จาก `postgres` → `aicp_migrator` ซึ่งเป็นความเสี่ยงตรง ๆ
(SECURITY DEFINER รันด้วยสิทธิ์ owner) — วัดแล้วไม่พัง:

```
authenticated membership rows                 : [{"workspace_id":"shop-a"}]
authenticated workspaces rows (suspended ตัดออก) : [{"workspace_id":"shop-a"}]
authenticated connections rows                : [{"workspace_id":"shop-a","connection_id":"web-a","channel":"web"}]
rpc membership oracle (own ws / foreign ws)   : {"own":true,"other":false}
aicp_migrator EXECUTE on auth.uid()           : true   (PUBLIC default)
aicp_migrator SELECT on auth.users            : false  (ไม่กว้างเกิน)
```

คือการ grant `USAGE ON SCHEMA auth` + `SELECT ON workspaces/workspace_memberships` ที่เพิ่มมา **พอและไม่เกิน**
สำหรับ function นี้ และไม่มีการให้สิทธิ์อ่าน `auth.users`

### 2.4 seed + bootstrap (F-01)

statement ทั้ง 3 ของ `scripts/seed-local.mjs` (คัดลอกมาทั้งดุ้น รวม `ON CONFLICT`) รันซ้ำ 2 รอบบน schema
ที่ apply migration ชุด fix:

```
seed statements: {"stmt1":"OK (twice, idempotent)","stmt2":"OK (twice, idempotent)","stmt3":"OK (twice, idempotent)",
                  "rows":[{"workspace_id":"synthetic-shop","role":"owner","channel":"web"}]}
public tables (HEAD): []
```

### 2.5 `public.` ทั้ง repository (ไม่ใช่แค่ migrations)

```
$ git grep -n "public\." -- .
REPORT-HOST-003-FIX.md:17:## `public.` reference scan
REPORT-HOST-003.md:25:- `rg -n 'public\.' supabase/migrations` ...
research/README.md:3:This folder is public. ...
tasks/TASK-001-FOUNDATION.md:22:- No merging/copying private source repos to public.
```

ทั้ง 4 จุดเป็นข้อความเอกสาร/คำอธิบาย ไม่ใช่ object reference ของ AICP และไม่มี `public.workspaces` /
`public.knowledge_*` เหลืออยู่ใน code, script, test หรือ config ใด ๆ

### 2.6 test ที่เพิ่มมา: assert จริง ไม่ใช่ assert ลอย

- `workspace-host-migration.test.ts` เพิ่ม `assert.deepEqual` บน `DISTINCT owner` ของ relation
  (relkind r,p,i,S) และ deepEqual รายชื่อ function 3 ตัว — ถ้ามี object ใดหลุดเป็น owner อื่น
  หรือ function เพิ่ม/หาย test จะ fail (probe ของผมยืนยันว่า query เดียวกันคืนค่าเดียวจริง)
- `knowledge-database-url.test.ts` เพิ่มเคส reject จริง 3 เคส (ref 19 ตัว, ref มี `-`, ไม่มี password)
  และ `assert.throws(..., TypeError)` สำหรับ local — ผมรันไฟล์นี้แยก: `pass 1, fail 0`
- ไม่มี `test.skip`/`todo`; จำนวน test เท่าเดิม 176 (เพิ่ม assertion ไม่ได้เพิ่ม/ลดเคส)

---

## 3. Finding ใหม่จากการตรวจรอบนี้

| ID | Severity | เรื่อง | หลักฐาน |
|---|---|---|---|
| **N-01** | LOW | **F-07 ถูก “pin” ด้วย test แทนการแก้** — test ใหม่ assert ว่า `APP_ENV=lab` ต้องล้มด้วย `LOCAL_SUPABASE_SERVER_SECRET_REQUIRED` ทำให้พฤติกรรมที่ยังเสียกลายเป็นสัญญาที่ test ล็อกไว้ ใครจะทำ HOST-004 ต้องแก้ test นี้ก่อน และคนอ่าน suite อาจเข้าใจผิดว่า lab ใช้งานได้ | `platform/composition/knowledge-database-url.test.ts` (ท้ายไฟล์) + `node --test dist/composition/knowledge-database-url.test.js` → pass 1 |
| **N-02** | LOW | **เจ้าของใหม่ยังอ่านข้อมูล knowledge ไม่ได้เพราะ FORCE RLS** — `aicp_migrator` เป็น owner ของตาราง knowledge ทั้ง 5 แต่ตารางเหล่านี้ `FORCE ROW LEVEL SECURITY` → `SELECT count(*) FROM aicp.knowledge_versions` ในฐานะ migrator โดยไม่ตั้ง `app.workspace_id` ได้ **0 แถว** (ตาราง workspace ที่ไม่ forced ได้ 1 แถว) แปลว่า DDL/backfill ผ่าน role นี้ทำงานได้เฉพาะส่วน schema ส่วน data repair/inspection ยังต้องตั้ง scope เองหรือใช้ superuser | probe: `aicp_migrator SELECT forced-RLS knowledge_versions rows (no app.workspace_id)` → `0`; `workspace_memberships` → `1` |
| **N-03** | INFO | **`aicp_migrator` ยัง NOLOGIN และไม่มีใครเป็น member** — ปิด F-03 ในเชิง ownership แล้ว แต่ “future migrations run as `aicp_migrator`” ยังต้องมี superuser `SET ROLE` ให้ (ยืนยัน: `members of aicp_migrator` = `[]`, `rolcanlogin=false`) เป็น ambiguity A-1 เดิมที่ยังต้องให้ผู้คุมตัดสิน | probe: `members of aicp_migrator: []`, `rolcanlogin:false` |
| **N-04** | INFO | **test ใช้ loader hook ระดับ process** — `register("data:text/javascript,...")` ใน test กลางไฟล์เพื่อ stub `server-only` เป็น escape hatch ที่เปลี่ยน module resolution ของ process ทั้งหมด (ทำงานได้วันนี้ แต่เปราะและผูกกับ Node loader API; ถ้ามี test อื่นในไฟล์เดียวกันในอนาคตจะได้รับผลด้วย) | `git diff e6b83cd e123383 -- platform/composition/knowledge-database-url.test.ts` |
| **N-05** | INFO | **การ expose `aicp` ทำให้ function ใน schema กลายเป็น RPC** — `aicp.is_active_workspace_member(text)` มี `EXECUTE` ให้ `authenticated` อยู่แล้วก่อนหน้านี้ และตอนนี้เรียกผ่าน PostgREST ได้; วัดแล้วรั่วเฉพาะ membership ของผู้เรียกเอง (`own=true/foreign=false`) ไม่ใช่ช่องโหว่ แต่ควรเป็นการตัดสินใจที่รู้ตัว ส่วน trigger function เรียกตรงไม่ได้ (`DENIED 0A000`) | probe: rpc oracle + `direct call of trigger fn by authenticated: DENIED 0A000` |

**ไม่พบ** สิ่งเหล่านี้ (ตรวจแล้วไม่เจอ): ownership transfer ที่ทำให้ runtime grant หรือ RLS พัง,
allowlist ที่กว้างขึ้น (lab แคบลง, local เท่าเดิม), test ที่ assert ไม่มีอะไร, และ `public.` reference ใหม่
ใน repository

---

## 4. สิ่งที่ยังไม่ได้พิสูจน์ (ข้อจำกัดของการตรวจรอบนี้)

- **PostgREST จริง** — ไม่ได้สตาร์ท Supabase stack (ต้องมี Docker) ดังนั้น F-02 ปิดได้ในระดับ config +
  สิทธิ์ของ role เท่านั้น ยังไม่มีหลักฐานว่า `Accept-Profile: aicp` ตอบ 200 จริง และ δεν ทดสอบ resource
  embedding `workspaces!inner(status)` ผ่าน PostgREST
- **`supabase db reset --local` + `npm run seed:local` แบบ end-to-end** — ต้องมี Docker, local auth
  server และ credential; ผมพิสูจน์ด้วยการรัน SQL ของ seed บน PGlite ไม่ใช่การรัน script เต็ม
- **hosted Supabase** — ห้ามต่อ; จึงไม่ทราบว่า `GRANT USAGE ON SCHEMA auth TO aicp_migrator` และ
  `ALTER TABLE ... OWNER TO aicp_migrator` จะผ่านสิทธิ์ของ role `postgres` บน hosted project หรือไม่
  (บน hosted `postgres` ไม่ใช่ superuser และไม่ได้เป็น member ของ `aicp_migrator` — ความเสี่ยงเชิง
  portability ที่มีอยู่แล้วตั้งแต่ `ALTER SCHEMA ... OWNER` ในรอบก่อน)
- **connection ผ่าน pooler จริง** (5432/6543), พฤติกรรม PgBouncer transaction mode กับ
  `set_config(..., true)` และ pool `pg` (max 4) — ยังไม่ทดสอบ
- **รัน migration ในฐานะ `aicp_migrator`** — ทำไม่ได้จริงเพราะ role เป็น NOLOGIN/ไม่มี member
  (ทดสอบได้แค่ `SET ROLE` จาก superuser)
- **migration บนฐานข้อมูลที่มีข้อมูลอยู่แล้ว** — probe ทุกตัวเริ่มจาก PGlite ใหม่
- **`npm ci`** — ไม่ได้รันซ้ำ (ไม่มี dependency เปลี่ยน; `package-lock.json` ไม่อยู่ใน diff)

---

## 5. Verdict

**ผ่านสำหรับ decision D-20261025-11 ในขอบเขต schema isolation** — F-01, F-02, F-03, F-04, F-06 ปิดจริง
ด้วยหลักฐานที่วัดเอง โดยไม่มีการผ่อน assertion, ไม่มีการขยายสิทธิ์ของ runtime, RLS/policy/storage bucket
ไม่เปลี่ยน และ `public` ว่างจริงทั้งใน migration และทั้ง repository

**ต้องบันทึกไว้ก่อนรับ (ไม่บล็อกสโคปนี้ แต่ห้ามหาย):**

1. **F-05 = PARTIAL** — lab allowlist ยังรับ subdomain ใดก็ได้ของ `pooler.supabase.com`, ไม่ผูก ref กับ
   host project, และไม่สนใจ query/fragment (`?sslmode=disable` ผ่าน) ต้องมีคำตัดสินของผู้คุม (A-5 เดิม)
   ว่าจะปิดช่องเหล่านี้หรือยอมรับตามตัวอักษร requirement
2. **F-07 = OPEN** — lab mode ยังสตาร์ทไม่ได้ และตอนนี้มี test ที่ยืนยันความล้มเหลวนั้น ต้องไปกับ **HOST-004**
   และควรลบ/แก้ test ที่ pin พฤติกรรมเสียเมื่อแก้จริง (N-01)
3. **N-02/N-03** — ถ้าจะใช้ `aicp_migrator` เป็น role สำหรับ migration ในอนาคต ต้องรู้ว่า (ก) ยัง login
   ไม่ได้และไม่มี member, (ข) ตาราง knowledge เป็น FORCE RLS จึงอ่านข้อมูลในฐานะ owner ไม่ได้ถ้าไม่ตั้ง
   `app.workspace_id`

DONE
