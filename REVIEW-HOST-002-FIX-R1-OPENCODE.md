# REVIEW — HOST-002 FIX ROUND 1 (opencode)

- **ผู้ตรวจ:** opencode
- **วันที่:** 2026-11-03
- **รีวิซันเป้าหมาย:** `4201b0d` (`fix(host): close HOST-002 review findings F1 F2 F5 F6`)
- **ฐาน:** `7de2649` (merge PR #26)
- **โหมด:** ตรวจแบบอิสระ (independent review) — ไม่แก้โค้ด ไม่ merge ไม่ push
- **ขอบเขต findings:** F1, F2, F5, F6 จาก `REVIEW-HOST-002-OPENCODE.md` (รีวิวรอบแรก)

> หมายเหตุวิธีทำงาน: ส่วน "ผลการตรวจครั้งแรก" ด้านล่างเขียนขึ้นก่อนเปิดอ่าน `REPORT-HOST-002-FIX.md` และก่อนอ่าน commit message ของ `4201b0d` ทั้งสิ้น จากนั้นจึงมีส่วน "การตรวจหลังทราบคำอธิบายของผู้สร้าง" แยกไว้ท้ายไฟล์

---

## 1. แผนตรวจและลำดับที่ใช้ (กำหนดก่อนเห็นเทสต์/รายงานใหม่)

1. ยืนยัน revision เป้าหมายและ diff ขอบเขต (`git log`, `git diff 7de2649..4201b0d --stat`)
2. อ่าน requirement ของ F1/F2/F5/F6 จากรีวิวรอบแรก แล้วแปลงเป็น accept criteria ของตัวเอง
3. ตรวจ static: migration ใหม่, repository/adapter, host wiring, routes, F5 script
4. รัน gates มาตรฐาน: `npm run typecheck`, `npm test`
5. เขียน attack harness แยกใน temp (`C:/Users/Win11/AppData/Local/Temp/opencode/host002-fix-r1/`) รัน PGlite กับ migration จริงใน worktree
6. พยายามทำลาย control: runtime/non-owner revoke/archive/forge/status flip/identity rewrite/version insert/row lock/cross-workspace/anon/PUBLIC/dropped actor
7. ตรวจ F6 route ด้วยโมดูลที่ compile แล้ว (`dist/`) โดยไม่เปิด server จริง
8. ตรวจ F5 ด้วย DB สดที่มีแค่ migration ก่อน hardening
9. เขียนผลและ verdict **ก่อน** เปิด `REPORT-HOST-002-FIX.md` และ commit message
10. หลังเขียนผลแรกแล้ว จึงเปิดรายงาน/commit message และทำ "informed verification" เพื่อกระทบยอด claim

### Accept criteria ที่ตั้งไว้เอง

| finding | เกณฑ์ผ่านของฉัน |
|---|---|
| F1 | runtime (`knowledge_runtime`) เรียก revoke/archive ผ่าน RPC ไม่ได้ และเขียนคอลัมน์ revoke/archive ตรง ๆ ไม่ได้; owner เท่านั้นที่ทำได้; ผู้กระทำมาจาก `auth.uid()` ไม่ใช่พารามิเตอร์; สิทธิ์ที่เหลือ (ถ้ามี) ต้องไม่ทำให้เลี่ยง control ได้ |
| F2 | actor ที่หายไป/ไม่ถูกต้องต้อง fail closed ทุกเส้นทาง; opt-out สำหรับเทสต์ต้องชื่อชัดและไม่มีเส้นทาง production ไปถึง |
| F5 | script ต้อง read-only จริง (ไม่เขียน/ไม่ DDL) และตรวจจับ duplicate ที่จะทำให้ unique index ล้มเหลวได้ |
| F6 | หลัง approve commit แล้ว read-back ล้มเหลว/ได้ null ต้องตอบ 200 พร้อมข้อมูลขั้นต่ำ; ความล้มเหลวจริงก่อน commit ต้องไม่ถูกกลบเป็น 200 |

---

## 2. บริบทที่เปิดเผยก่อนเขียนผลครั้งแรก

- อ่านแล้ว: โค้ดที่ diff, migration ทั้งชุด, เทสต์ที่เปลี่ยน, สคริปต์ F5, routes, host wiring
- **ยังไม่อ่าน:** `REPORT-HOST-002-FIX.md`, `git show 4201b0d --format=%B` (commit message)
- ไม่ได้รัน `npm run build:console`, ไม่ได้ start server, ไม่ได้ `npm ci`/`npm install`
- ไม่มีการแก้ไฟล์ใน repo; ไฟล์ที่เขียนมีเพียงรายงานนี้ และสคริปต์ชั่วคราวนอก repo

---

## 3. ผลการตรวจครั้งแรก

### 3.1 Gate มาตรฐาน

```text
$ npm run typecheck
> tsc --noEmit -p tsconfig.json
(exit 0, ไม่มี error)

$ npm test
# tests 226 / pass 226 / fail 0
# duration_ms ~4266
```

ผล: ผ่านทั้งคู่ จำนวนเทสต์ตรงกับที่คาด (226)

### 3.2 F1 — owner-only revoke/archive ผ่าน SECURITY DEFINER + `auth.uid()` และ runtime เสียสิทธิ์คอลัมน์

**สิ่งที่โค้ดทำ**

- `supabase/migrations/20261103000200_host_hardening_revoke.sql:4-52` สร้าง `aicp.revoke_knowledge_version(text,text,text,text)` เป็น `SECURITY DEFINER`, `SET search_path = pg_catalog, aicp`; ผู้กระทำมาจาก `revoker text := (SELECT auth.uid())::text` (บรรทัด 11), ปฏิเสธ `NULL` (14-16) และไม่ใช่ owner (17-19), รับ reason แบบมีขอบเขต (20-22), ล็อก source (25-30) และ version (32-39), อนุญาตเฉพาะสถานะ `approved` (40-42), แล้วเขียน `status='revoked', revoked_at, revoked_by=revoker, revocation_reason` (44-47)
- `:54-81` สร้าง `aicp.archive_knowledge_source(text,text)` แบบเดียวกัน ใช้ `archiver := auth.uid()` และ owner check
- `:50-52` และ `:79-81` ตั้ง owner เป็น `aicp_migrator`, `REVOKE ALL ... FROM PUBLIC`, ให้ `EXECUTE` เฉพาะ `authenticated`
- `:86-87` ถอน `UPDATE (revoked_at, revoked_by, revocation_reason)` บน `knowledge_versions` และ `UPDATE (status)` บน `knowledge_sources` จาก `knowledge_runtime`
- `:93` ให้ `UPDATE (created_at)` บน `knowledge_sources` แก่ runtime เพื่อให้ `SELECT ... FOR UPDATE` ยังล็อกแถวได้
- `:95-112` trigger `knowledge_source_identity_guard` ปฏิเสธการเปลี่ยน `workspace_id, source_id, kind, title, created_at` ด้วย `23514`

**ผลการโจมตี (PGlite, migration จริงทั้งชุด, รันเป็น `knowledge_runtime`)**

คำสั่งที่ใช้: `node attack.mjs`, `attack2.mjs`, `attack3.mjs` (temp) — ผลลัพธ์สรุป:

```text
runtime revoke with forged revoked_by        -> 42501 permission denied for table knowledge_versions
runtime forge revoked_by only                 -> 42501
runtime status='revoked' only                 -> 23514 violates check constraint "knowledge_versions_check1"
runtime clear approved_*                      -> 42501
runtime status='approved' on indexed          -> 23514 violates check constraint "knowledge_versions_check"
runtime archive source                        -> 42501 permission denied for table knowledge_sources
runtime call revoke RPC                       -> 42501 permission denied for function revoke_knowledge_version
runtime call archive RPC                      -> 42501 permission denied for function archive_knowledge_source
runtime call approve RPC                      -> 42501 permission denied for function approve_knowledge_version
runtime created_at rewrite                    -> 23514 knowledge source identity is immutable
runtime title/kind/source_id rewrite          -> 42501
runtime DELETE / TRUNCATE source              -> 42501
runtime INSERT..ON CONFLICT DO UPDATE title   -> 42501
runtime INSERT..ON CONFLICT DO UPDATE status  -> 42501
runtime INSERT..ON CONFLICT DO UPDATE created_at (changed) -> 23514 identity is immutable
runtime disable identity trigger              -> 42501 must be owner of table knowledge_sources
runtime session_replication_role=replica      -> 42501 permission denied to set parameter
runtime INSERT version with status column     -> 42501
```

session/role escalation:

```text
runtime SET ROLE aicp_migrator                -> 42501
runtime SET ROLE authenticated                -> 42501
runtime CREATE in schema aicp                 -> 42501
runtime DROP/ALTER CHECK constraint           -> 42501
runtime TRUNCATE                              -> 42501
pg_auth_memberships ของ knowledge_runtime/authenticated/anon -> [] (ไม่มี membership)
table owners ของทุกตารางใน aicp               -> aicp_migrator
pg_has_role('knowledge_runtime','authenticated','MEMBER') -> false
```

ฟังก์ชันทั้งสาม:

```text
owner=aicp_migrator, prosecdef=true, config={search_path=pg_catalog, aicp}
acl={aicp_migrator=X/aicp_migrator,authenticated=X/aicp_migrator}
runtime can execute = false, authenticated can execute = true, anon can execute = false
```

**owner path ยังทำงาน**

```text
owner revoke  -> สำเร็จ; revoked_by = OWNER_A (มาจาก auth.uid()), approved_by เดิมคงอยู่
owner revoke ซ้ำ -> REVOCATION_NOT_ELIGIBLE (AC001)
owner archive -> สำเร็จและเรียกซ้ำได้ (idempotent)
owner approve หลัง revoke -> ทำได้ (ต้องผ่าน ingestion กลับมาเป็น indexed ก่อน)
ingest หลัง revoke: indexed -> failed -> validating -> extracting -> indexed -> approve ทำงาน
```

**การตัดสินใจเชิงออกแบบ (ตรวจแล้ว ไม่ใช่ช่องโหว่):** การคง `UPDATE (created_at)` บน `knowledge_sources` เป็น "lock handle" ยอมรับได้เพราะ (ก) ค่าคอลัมน์นี้ถูกล็อกด้วย trigger ให้ immutable (ทดสอบแล้วได้ `23514`) และ (ข) ไม่มีสิทธิ์ `UPDATE (status)` เหลืออยู่ การเปลี่ยนสถานะทำได้เฉพาะผ่าน `archive_knowledge_source` ที่รันเป็น `aicp_migrator` เท่านั้น

**สรุป F1: CLOSED**

### 3.3 F2 — fail closed และ test-only opt-out

**สิ่งที่โค้ดทำ**

- `platform/adapters/persistence/postgres/knowledge-repository.ts:351` ประกาศ `NO_ACTOR_FOR_SCHEMA_TESTS = Symbol("NO_ACTOR_FOR_SCHEMA_TESTS")` ชื่อสื่อเจตนาชัด
- `:355-364` `assertActiveWriter`: คืนทันทีเฉพาะเมื่อ argument **เป็น symbol ตัวเดียวกัน** (identity check); ถ้าไม่ใช่ string หรือ length 0 → `MEMBERSHIP_REQUIRED`; ถ้า DB ตอบ `AC001` → `MEMBERSHIP_REQUIRED`
- `:375-380` ทุก write ของ repository ผ่าน `scopedWrite` ซึ่งเรียก `assertActiveWriter` ก่อน operation
- `platform/adapters/persistence/postgres/knowledge-intake-audit.ts:42,50,76` audit ทั้งสอง write ถือ actor และ assert เช่นกัน
- `platform/composition/merchant-knowledge-host.ts:13,19-20` production host รับ `actorUserId: string` และส่งต่อให้ repository/audit; ไม่มีการอ้างถึง opt-out

**ผลการทดสอบ**

Static reachability:

```text
NO_ACTOR_FOR_SCHEMA_TESTS ถูกอ้างถึงเฉพาะ:
- knowledge-repository.test.ts
- workspace-host-migration.test.ts
production host / routes / composition: 0 การอ้างถึง
```

Behavior ผ่านโมดูลที่ compile แล้ว (`dist/`):

```text
actor=undefined            -> MEMBERSHIP_REQUIRED (dbCalls=0)
actor=null                 -> MEMBERSHIP_REQUIRED (dbCalls=0)
actor=""                   -> MEMBERSHIP_REQUIRED (dbCalls=0)
actor=number               -> MEMBERSHIP_REQUIRED (dbCalls=0)
actor=String object        -> MEMBERSHIP_REQUIRED (dbCalls=0)
actor=lookalike Symbol     -> MEMBERSHIP_REQUIRED (dbCalls=0)
actor=opt-out Symbol       -> bypass ตามที่ออกแบบ (dbCalls=0)
```

กรณี whitespace string (`"   "`) ผ่าน guard ฝั่ง JS แต่ถูกปฏิเสธที่ DB:

```text
assert_active_knowledge_writer('shop-a','   ')        -> AC001 MEMBERSHIP_REQUIRED
assert_active_knowledge_writer('shop-a','<uuid> ')    -> AC001
assert_active_knowledge_writer('shop-a',' <uuid>')    -> AC001
assert_active_knowledge_writer('shop-a', null)        -> AC001
```

**สรุป F2: CLOSED** (opt-out เป็น import-reachable ในทางเทคนิค แต่ไม่ใช่ค่าที่ไหลมาจาก input และ production signature บังคับ `string`; ดูข้อสังเกต LOW-2)

### 3.4 F5 — read-only duplicate pre-check

**สิ่งที่โค้ดทำ** — `scripts/check-web-connection-duplicates.sql:1-11` เป็น `SELECT` เดียว ไม่มี DDL/DML; เงื่อนไข `channel='web' AND status='active' GROUP BY workspace_id HAVING count(*) > 1` ตรงกับ predicate ของ `CREATE UNIQUE INDEX workspace_one_active_web_connection` ใน `20261103000100_host_hardening.sql:102`

**ผลการทดสอบ (PGlite, DB สดเฉพาะ migration ก่อน hardening)**

```text
stripped statements=1; starts SELECT=true; modifying keyword=false
pre-check output: [{"workspace_id":"shop-a","active_web_connections":2,
                    "connection_ids":["web-a","web-a-2"]}]
DB สะอาด -> 0 rows
apply 20261103000100 บน DB ที่มี duplicate -> 23505 could not create unique index
after failed apply, function present -> 0 (rollback ทั้ง transaction)
```

ยืนยันว่า script ตรวจจับเงื่อนไขที่ทำให้ migration ล้มได้จริง และไม่แก้ migration ที่ merge แล้ว

**สรุป F5: CLOSED**

### 3.5 F6 — approve route ตอบ 200 ข้อมูลขั้นต่ำหลัง commit

**สิ่งที่โค้ดทำ** — `platform/apps/merchant-console/lib/knowledge-routes.ts:131-152`:

- `:135` ต้องเป็น owner (ไม่ใช่ owner → 403)
- `:139` `await approval.approve(...)` — ถ้าล้มเหลวจะถูกโยนออกไปที่ `routeErrorResponse` (ไม่ถูกกลบ)
- `:140-146` หลัง commit พยายาม read-back; ถ้า throw → กลืนไว้เพื่อไปตอบขั้นต่ำ
- `:147` ถ้า read-back ได้ `null` → `200 {data:{sourceId,versionId,status:"approved"}}`

**ผลการทดสอบ (โมดูล `dist/` + fake approval/repository)**

```text
approval throws APPROVAL_NOT_ELIGIBLE -> 400 {"error":"APPROVAL_NOT_ELIGIBLE"}
approval throws generic Error        -> 500 {"error":"REQUEST_FAILED"}
approval ok, read-back throws        -> 200 {"data":{"sourceId":"s1","versionId":"v1","status":"approved"}}
approval ok, read-back null          -> 200 {"data":{"sourceId":"s1","versionId":"v1","status":"approved"}}
staff approve                        -> 403 {"error":"OWNER_ROLE_REQUIRED"}
```

ยืนยันว่า failure ก่อน commit ไม่ถูกกลบ และ read-back failure หลัง commit ไม่ทำให้ client retry ซ้ำ

**สรุป F6: CLOSED**

### 3.6 การแมป error

```text
42501 -> CROSS_WORKSPACE_ACCESS_DENIED -> HTTP 403
23514 -> INVALID_VERSION_TRANSITION   -> HTTP 400
AC001 -> MEMBERSHIP_REQUIRED / OWNER_ROLE_REQUIRED -> 403
```

อ้างอิง: `knowledge-repository.ts:340,342`; `knowledge-intake-audit.ts` ใช้ `assertActiveWriter`; `knowledge-routes.ts` ใช้ `routeErrorResponse`

### 3.7 ความสะอาดของ diff

- ไฟล์ที่เปลี่ยนตรงกับที่อ้างใน commit scope: migration ใหม่ 1 ไฟล์, adapter ใหม่ 1 ไฟล์, repository/audit/host/routes, script F5, เทสต์ที่เกี่ยวข้อง
- ไม่พบการลบ/ทำให้ assertion อ่อนลงในเทสต์เดิม
- ไม่มี dependency ใหม่, ไม่มี secret, ไม่มี endpoint ใหม่, ไม่แก้ migration ที่ merge แล้ว
- `20261023000100_g1_workspace_host.sql:105` ยังคง grant เดิม (runtime ได้ UPDATE ทุกคอลัมน์) แต่ถูกถอนเพิ่มใน migration ใหม่ — ถูกต้องตาม pattern "migration ใหม่ทับของเก่า"

---

## 4. Findings (จัดอันดับ)

### CRITICAL

ไม่มี

### HIGH

ไม่มี

### MEDIUM

ไม่มี

### LOW

**LOW-1 — `42501` ถูกแมปเป็น `CROSS_WORKSPACE_ACCESS_DENIED`/403 ซึ่งกลบปัญหา grant ที่ตั้งผิดได้**

- ตำแหน่ง: `platform/adapters/persistence/postgres/knowledge-repository.ts:340`
- สถานการณ์ล้มเหลว: ถ้าในอนาคตมี route เรียก `repository.revokeVersion()` หรือ `archiveSource()` (ตอนนี้ยังไม่มี) และ deployment ลืม apply migration จริง ผู้ใช้จะเห็น 403 "cross-workspace" แทนที่จะเป็น 500 ที่ชี้ว่าสิทธิ์ฐานข้อมูลผิด ทำให้วินิจฉัยยาก
- ระดับ: LOW (ไม่ใช่ช่องโหว่; fail closed อยู่แล้ว) — ควรมี log ฝั่ง server ที่แยก permission error ออกจาก tenant mismatch

**LOW-2 — opt-out เป็น import-reachable ไม่ใช่ type-impossible**

- ตำแหน่ง: `platform/adapters/persistence/postgres/knowledge-repository.ts:351-352`
- สถานการณ์: โค้ด production ในอนาคตสามารถ `import { NO_ACTOR_FOR_SCHEMA_TESTS }` แล้วส่งเข้า constructor ได้ (ต้องมี explicit import + cast) — ไม่ใช่ค่าจาก input แต่ไม่ได้ถูกกันด้วยชนิดข้อมูลในระดับ signature ของ repository
- ระดับ: LOW — ชื่อและคอมเมนต์ชัดเพียงพอ; ถ้าต้องการแข็งขึ้นให้ย้าย symbol ไปไฟล์ `*.testing.ts` หรือใช้ branded type

**LOW-3 — พฤติกรรมของ archive/revoke กับ source ที่ archived แล้วไม่ได้ระบุชัด**

- ตำแหน่ง: `20261103000200_host_hardening_revoke.sql:54-77`, `:32-47`
- สถานการณ์: `archive_knowledge_source` เรียกซ้ำบน source ที่ archived แล้วสำเร็จเงียบ ๆ (idempotent) และ `revoke_knowledge_version` ยอมให้ revoke version ที่ approved อยู่ใต้ source ที่ archived แล้ว — ไม่เป็นปัญหาความปลอดภัย แต่ไม่มีเอกสาร/เทสต์ระบุเจตนา
- ระดับ: LOW — ควรระบุในเอกสารหรือเพิ่มเทสต์เจตนา

---

## 5. พื้นที่ที่ยังไม่ได้ทดสอบ / ข้อจำกัด

1. **ไม่ได้ทดสอบ concurrency จริง** — PGlite รันแบบ single connection; พฤติกรรม `FOR UPDATE` ภายใต้ transaction พร้อมกันจริงยังไม่ถูกพิสูจน์ด้วย multi-connection
2. **ไม่ได้ทดสอบกับ Supabase จริง** — `auth.uid()` ถูกจำลองด้วย `current_setting('request.jwt.claim.sub')`; พฤติกรรมจริงของ PostgREST/JWT ยังไม่ถูกตรวจ
3. **`SupabaseKnowledgeRevocation` ยังไม่ถูก wire เข้า production** — ไม่มี route revoke/archive ในแอป; F1 พิสูจน์ได้ในระดับ DB/เทสต์เท่านั้น (อยู่นอก scope ของรอบนี้)
4. **ไม่ได้รัน `npm run build:console`** ตามคำสั่ง; ตรวจ F6 ด้วย `dist/` ที่มีอยู่
5. **ไม่ได้ทดสอบ RLS ของ `authenticated` แบบละเอียด** — ตรวจเพียงว่าเห็นเฉพาะ workspace ตัวเอง (ผ่าน)
6. **ไม่ได้ตรวจ LINE webhook path** — อยู่นอก findings ชุดนี้

---

## 6. ความกำกวม (Ambiguities)

- **F2 "unreachable from production"**: ตีความว่า "ไม่มีเส้นทาง runtime ที่สร้าง symbol นี้จาก input" ซึ่งผ่าน; หากตีความว่า "เป็นไปไม่ได้เชิงชนิดที่จะส่ง" จะไม่ผ่านสนิท (ดู LOW-2)
- **F1 "runtime loses column grants"**: runtime ยังถือ `UPDATE (created_at)` บน `knowledge_sources` โดยเจตนาเป็น lock handle; ตีความว่าไม่ขัด เพราะ trigger ล็อกค่าไว้และไม่ให้ความสามารถ revoke/archive — หากตีความตรงตัวว่า "ห้ามเหลือ UPDATE ใด ๆ" จะถือว่าเบี่ยง
- **F6 "minimal data"**: route ตอบ `sourceId, versionId, status` ซึ่งเป็นข้อมูลขั้นต่ำที่เพียงพอ; ไม่มีนิยามชัดว่าต้องมี/ไม่มี field ใด

---

## 7. Verdict

| finding | verdict |
|---|---|
| F1 — owner-only SECURITY DEFINER revoke/archive + runtime เสียสิทธิ์ | **CLOSED** |
| F2 — fail closed + test-only opt-out | **CLOSED** |
| F5 — read-only duplicate pre-check | **CLOSED** |
| F6 — approve 200 minimal หลัง commit | **CLOSED** |

**สรุปจำนวน:** `CRITICAL=0 HIGH=0 MEDIUM=0 LOW=3`

---

## 8. การตรวจหลังทราบคำอธิบายของผู้สร้าง (informed verification)

เปิดอ่านหลังเขียนผลครั้งแรกแล้ว: `REPORT-HOST-002-FIX.md` (36 บรรทัด) และ `git show 4201b0d --format=%B --no-patch`

### 8.1 กระทบยอด claim กับหลักฐานของฉัน

| claim ของผู้สร้าง | ผลตรวจอิสระ |
|---|---|
| migration ใหม่มี revoke/archive เป็น SECURITY DEFINER, owner `aicp_migrator`, REVOKE PUBLIC, EXECUTE เฉพาะ authenticated, actor จาก `auth.uid()` | ตรง — ตรวจ ACL/owner/prosecdef/search_path จาก catalog จริงแล้ว (`20261103000200:4-81`) |
| runtime เสีย `UPDATE (revoked_at, revoked_by, revocation_reason)` และ `UPDATE (status)` บน sources | ตรง — ยืนยันด้วยการยิงคำสั่งตรง ได้ 42501/23514 |
| คง `GRANT UPDATE (created_at)` เป็น lock handle + trigger กัน identity | ตรง — ยืนยัน trigger ทำงาน (23514) และ runtime ปิด/สลับ role ไม่ได้ |
| ไม่มี route เรียก revoke/archive และ `SupabaseKnowledgeRevocation` เป็น adapter ใหม่ | ตรง — grep แล้วมีแต่เทสต์ที่ import |
| F2 actor บังคับ, opt-out เป็น symbol เฉพาะเทสต์, host ส่ง actor เสมอ | ตรง — ตรวจ static + พฤติกรรม compiled แล้ว |
| F6 read-back ล้ม/ได้ null → 200 minimal | ตรง — รัน route ด้วย `dist/` แล้ว |
| F5 เป็น SELECT เดียวและจับ duplicate ได้ | ตรง — รันกับ PGlite และยืนยันว่า migration ล้มด้วย 23505 |
| assertion เดิมเปลี่ยนเฉพาะ M1 archive เป็น owner RPC | ตรง — `git diff` แสดงเฉพาะบรรทัดนั้นในเทสต์เดิม |
| README/package.json แก้ตามที่อ้าง | ตรง — README เพิ่มคำสั่ง pre-check, package.json เพิ่มไฟล์เทสต์ใหม่ |

### 8.2 ข้อคลาดเคลื่อนเล็กน้อยในรายงานผู้สร้าง (ไม่ใช่ข้อบกพร่องของโค้ด)

1. **บรรทัดอ้างอิง `FOR UPDATE` ไม่ตรงกับ HEAD** — รายงานอ้าง `knowledge-repository.ts:404/:454/:567` แต่ที่ `4201b0d` อยู่ที่ `:412/:462/:575` ตัวเลขที่อ้างคือเลขก่อนการเพิ่ม 8 บรรทัดของ F2 (pre-fix) จึงไม่กระทบข้อสรุป แต่ควรแก้ให้ตรง revision
2. **`npm run check` ในรายงานมี `build:console`** — ฉันไม่รันตามคำสั่งรีวิว (ห้ามรัน) จึงยืนยันได้เฉพาะ `typecheck` + `test`; ส่วน `build:console` เป็น claim ที่ฉันไม่ตรวจ
3. **ตัวเลข RED (224/218/6)** — ไม่ได้ reproduce เพราะต้อง revert โค้ด/เทสต์ใน worktree ซึ่งอยู่นอกขอบเขต; ถือเป็น claim ที่ยังไม่ยืนยัน (GREEN 226/226 ยืนยันแล้ว)

### 8.3 จุดที่รายงานผู้สร้างกับฉันเห็นตรงกันในเชิงความเสี่ยง

- ผู้สร้างระบุเองว่า `42501` ถูกแมปเป็น `CROSS_WORKSPACE_ACCESS_DENIED` และ "ทำให้เข้าใจผิด" — ตรงกับ **LOW-1** ของฉัน
- ผู้สร้างระบุว่ายังไม่มี route revoke/archive — ตรงกับข้อจำกัดข้อ 3 ของฉัน (F1 พิสูจน์ได้แค่ระดับ DB)
- ผู้สร้างยอมรับว่าไม่ได้ทดสอบ Supabase จริง/PostgREST — ตรงกับข้อจำกัดข้อ 2 ของฉัน

### 8.4 ข้อที่ฉันตรวจเพิ่มหลังอ่านรายงานและยังคงข้อสรุปเดิม

- ตรวจ `merchant-host-harness.ts` ที่แก้: `authenticatedRpcClient` ส่งพารามิเตอร์ 4 ตัวสำหรับ revoke และ 2 ตัวสำหรับ archive ถูกต้อง; ไม่มีการลดความเข้มของ assertion
- ตรวจว่าไม่มี producer อื่นส่ง `NO_ACTOR_FOR_SCHEMA_TESTS` นอกจากไฟล์เทสต์ (ยืนยันซ้ำ)
- ตรวจว่า `20261103000100` ไม่ถูกแก้ (เป็นไฟล์ที่ merge ไปแล้ว) — diff ไม่แตะไฟล์นี้

### 8.5 สรุปหลังกระทบยอด

ไม่พบข้อขัดแย้งที่จะเปลี่ยน verdict; ข้อคลาดเคลื่อนที่พบเป็นเรื่องเลขบรรทัด/claim ที่ยังไม่ reproduce ไม่ใช่พฤติกรรมของโค้ด

**Verdict สุดท้าย:** F1 CLOSED · F2 CLOSED · F5 CLOSED · F6 CLOSED

**สรุปจำนวนสุดท้าย:** `CRITICAL=0 HIGH=0 MEDIUM=0 LOW=3`

DONE
