# รีวิวอิสระ HOST-002 — ขอบเขต authenticated host

- ผู้รีวิว: **opencode** (ไม่ใช่ผู้เขียนโค้ด ไม่ใช่ Commander)
- วันที่: 2026-11-03
- เป้าหมายที่ตรวจ: `main` @ `7de264922d88b29272c281c05e520e358fe6b031` (merge PR #26) เทียบฐาน `acb0e9e`
- ขนาด diff: 34 ไฟล์ +2383/−288 (`git diff --stat acb0e9e..7de2649`)
- ผลรวม: **CRITICAL=0 HIGH=0 MEDIUM=2 LOW=4**

**คำตัดสิน:** โค้ดส่วน M1/M2/M3 และการทดสอบทำได้ตามเจตนาของ task และหลักฐานหนักแน่นพอควร แต่ยัง **ไม่ผ่านเกณฑ์ acceptance ของ task เอง** ซึ่งระบุว่า "Independent reviewer (not the author) reports no actionable High/Medium findings on the final candidate" เพราะยังมี Medium ที่แก้ได้ด้วยต้นทุนต่ำ 2 ข้อ (ข้อ F1, F2) — ต้องแก้ก่อน หรือให้ Owner รับความเสี่ยงเป็นลายลักษณ์อักษรแล้วบันทึกเป็น carried risk

---

## 1. ขอบเขตและวิธีทำงาน

### 1.1 สิ่งที่ได้รับอนุญาตและทำจริง

| อย่าง | ทำ |
|---|---|
| อ่าน requirement | `tasks/TASK-HOST-002-HOST-HARDENING.md` + `AGENTS.md` ของ repo |
| ตั้ง acceptance plan เองก่อนดูเทสต์ | เขียนไว้ที่ `%TEMP%\opencode\host002-review\PLAN.md` (A1–A12) |
| อ่านโค้ดที่เปลี่ยน | ทุกไฟล์ใน diff รวม migration เดิม `20261022000100_knowledge.sql`, `20261023000100_g1_workspace_host.sql` |
| รันเทสต์/ไทป์เช็ก | `npm run typecheck`, `npm test` (ไม่รัน `build:console`, ไม่ start server, ไม่ `npm ci`) |
| หลักฐานอิสระ | PGlite in-memory **นอก repo** ที่ `%TEMP%\opencode\host002-review\` (probe1–probe6) |
| เขียนไฟล์ | เฉพาะรายงานนี้ + สคริปต์ probe นอก repo |

ไม่แตะ: ไฟล์ใน `platform/`, `supabase/`, เทสต์, migration, `docs/`, `source-repos/`, `_migration/`, `.secrets/`, ฐานข้อมูลจริง, provider ใด ๆ, ไม่ commit/push/merge/เปิด PR

### 1.2 บริบทที่ยังไม่เปิดตอนสรุป findings

ตามข้อกำหนด ผมยังไม่อ่าน `reports/host-002-2026-11-03/**` และไม่ใช้คำอธิบายของ PR #26 ในการสร้างข้อค้นพบ — findings ทั้ง 6 ข้อด้านล่างเกิดจาก plan + โค้ด + probe ของผมเองทั้งหมด หลังจากสรุปครบแล้วจึงเปิดรายงานผู้สร้างเพื่อเทียบ (หัวข้อ 7 "informed verification")

### 1.3 ลำดับการตรวจที่เลือก และเหตุผล

1. แบบจำลองสิทธิ์ฐานข้อมูล (blast radius กว้างสุด แก้ทีหลังแพงสุด)
2. ความเป็นทรานแซกชันของเส้นทางเขียน (race ที่ task สั่งตรง)
3. ขอบเขต HTTP (auth/origin/ขนาด/อัตรา)
4. ขอบเขตภาระ (M2)
5. รายการ Low
6. คุณภาพของเทสต์ (assertion อ่อน/ถูกลบ)
7. รันเทสต์สด + probe อิสระ

---

## 2. ผลการตรวจรายข้อ

### A1 — M1: แยกสิทธิ์อนุมัติออกจาก ingest → **ผ่าน**

หลักฐานจาก PGlite ที่ migrate ครบทุกไฟล์ (probe1 P1/P2 และ probe5 §1–§3):

```
P1 column privileges knowledge_runtime (UPDATE/INSERT):
   status upd=true ins=false · approved_at upd=false ins=false · approved_by upd=false ins=false
   revoked_at upd=true · revoked_by upd=true · revocation_reason upd=true
P1b table-level UPDATE privilege: false
P2 approve_knowledge_version      secdef=true runtime=false authenticated=true anon=false
   assert_active_knowledge_writer secdef=true runtime=true  authenticated=false anon=false
```

- ผู้อนุมัติมาจาก session ไม่ใช่พารามิเตอร์ — `supabase/migrations/20261103000100_host_hardening.sql:43`
  `approver text := (SELECT auth.uid())::text;` และ`:47-49` ปฏิเสธเมื่อ `approver IS NULL`
- ตรวจ owner ใน SQL ไม่ใช่ในแอป — `:50-52` `IF aicp.assert_active_knowledge_writer(...) <> 'owner' THEN RAISE EXCEPTION 'OWNER_ROLE_REQUIRED'`
- scope ข้าม workspace ถูกปิดด้วย `workspace_id = target_workspace_id AND source_id = target_source_id` (`:57`, `:68`, `:76`, `:84`)
- เฉพาะ `indexed` + มี chunk เท่านั้นที่อนุมัติได้ (`:74-80`) และ unique index เดิมกัน approved ซ้อน (`:86-88`)
- ถอนคอลัมน์อนุมัติออกจาก runtime — `:95` `REVOKE UPDATE (approved_at, approved_by) ON aicp.knowledge_versions FROM knowledge_runtime;`

ผลทดลอง (probe5 §1–§3, กำหนด `app.workspace_id` แบบเดียวกับ host และพิมพ์จำนวนแถว):

```
status='approved' only:            BLOCKED 23514 violates check constraint "knowledge_versions_check"
status='approved' + approved_at/by: BLOCKED 42501 permission denied for table knowledge_versions
revoked -> approved (status only):  BLOCKED 23514 revoked knowledge version is immutable
DELETE approved row:                BLOCKED 42501 permission denied for table knowledge_versions
```

การพยายามอนุมัติผ่าน repository เดิมก็ล้มแบบ fail-closed — `host-hardening-migration.test.ts:46-47` คาด `CROSS_WORKSPACE_ACCESS_DENIED` (42501 ถูกแมป) และ `:48-49` ยืนยันว่าแถวยังเป็น `indexed`

เส้นทางที่เหลือของ runtime คือ `revoked_*` (ตกทอดมาจาก `20261023000100_g1_workspace_host.sql:105`) ซึ่งไม่ทำให้ถึงสถานะ `approved` ได้จริง — ดูข้อ F1

### A2 — Membership revalidation ในทรานแซกชันเดียวกัน → **ผ่าน (มีข้อ F2 เรื่องค่าเริ่มต้น)**

- ฟังก์ชันมี `FOR SHARE` และ SECURITY DEFINER — `20261103000100_host_hardening.sql:7-23`
  `FOR SHARE OF membership, workspace;` (`:23`) และ `:24-26` `RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE = 'AC001'`
- เรียกในทรานแซกชันเดียวกับการเขียน — `platform/adapters/persistence/postgres/knowledge-repository.ts:367-371`
  `private scopedWrite(...) { return this.scoped(workspace, async (query) => { await assertActiveWriter(query, workspace, this.actorUserId); return operation(query); ...`
  และ `:379-382` เปิด transaction + `set_config('app.workspace_id', $1, true)` ก่อนเรียก operation
- enumerate เส้นทางเขียนครบ: `createSource:393`, `archiveSource:437`, `createVersion:451` (source check + version + chunks อยู่ในคลัสเตอร์เดียว), `transitionVersion:538`, `approveVersion:563`, `revokeVersion:601`; audit: `knowledge-intake-audit.ts:48-50` และ `:74-76`
- actor มาจาก session ที่ verify แล้ว — `platform/apps/merchant-console/lib/host.ts:6-8` (`identity` มาจาก `requireMerchantIdentity`) → `merchant-knowledge-host.ts:13` `createMerchantKnowledgeHost(actorUserId: string)` → `:19-20` ส่งต่อให้ทั้ง repository และ audit ไม่มีเส้นทางอ่าน actor จาก body/query
- สิทธิ์ไม่กว้างขึ้น: runtime อ่าน `workspace_memberships` ตรงไม่ได้ (test `host-hardening-migration.test.ts:116` คาด `42501`) และ `authenticated` เรียกฟังก์ชันไม่ได้ (`:115` คาด `42501`)

หลักฐานล็อก (probe4, หลังเรียกฟังก์ชันในทรานแซกชัน):

```
{"locktype":"relation","mode":"RowShareLock","granted":true,"relname":"workspace_memberships"}
{"locktype":"relation","mode":"RowShareLock","granted":true,"relname":"workspaces"}
```

`RowShareLock` ยืนยันว่า `FOR SHARE` ถูกจับจริงบนสองตาราง การที่ `UPDATE`/`DELETE` ของสมาชิกจะบล็อกจนธุรกรรมเขียนจบ เป็นพฤติกรรมที่ PostgreSQL รับประกัน (row share lock ขัดแย้งกับ row exclusive ของผู้แก้) — **ยังไม่ได้แข่งกันจริง** เพราะ PGlite มี connection เดียว (ดูหัวข้อ 5)

เทสต์ระดับ route จำลอง race ได้ตรงเจตนา — `merchant-knowledge-routes.test.ts:192` "a membership revoked after identity resolution cannot write" ใช้ hook `afterIdentity` แล้วยืนยัน 403 `MEMBERSHIP_REQUIRED` + `rowCounts()` ไม่เปลี่ยน (`:200`), รวมกรณี workspace ถูก `suspended` (`:222`)

### A3 — เทสต์ระดับ route ครบ 4 endpoint → **ผ่าน**

`platform/composition/merchant-knowledge-routes.test.ts` มี 12 เคส ครอบ:

| หมวด | เคส |
|---|---|
| unauthenticated | `:65` ทุก route ได้ 401 และไม่เขียนอะไร |
| origin | `:74` POST ปฏิเสธ origin แปลกปลอม/ไม่มี, `:82` GET ใช้ `Sec-Fetch-Site` |
| oversized / content-type / unknown fields | `:93-106`, `:108-114` |
| quarantine | `:116` ไฟล์เสียถูกกักแยกและอยู่ใน workspace เดียวกัน |
| owner-only approve | `:133` staff→403, owner อื่น→404, owner→200 แล้ว `approved_by` = owner จริง |
| cross-workspace | `:156` ส่ง `x-tenant-id: shop-a` แล้วยังได้ `no_answer` ของ workspace ตัวเอง |
| rate limit | `:171` |
| membership race | `:192` |
| error mapping | `:232` |

assertion ไม่ใช่แค่ "ไม่ 200": มีทั้ง status + error code + `assert.deepEqual(await harness.rowCounts(), before)` และตรวจ `objects.size` (harness `:161-168`) ตัวอย่าง `:179-184`

```
assert.equal(limited.status, 429);
assert.ok(Number(limited.headers.get("retry-after")) >= 1);
assert.deepEqual(await limited.json(), { error: "RATE_LIMITED" });
assert.deepEqual(await harness.rowCounts(), before);
```

harness ใช้ migration จริง + RLS จริง + role จริง (`merchant-host-harness.ts:42-66`, `:68-74`) ปลอมเฉพาะ Supabase Auth และ object storage (`:99-101`) ถือว่าน่าเชื่อถือในระดับที่ควร

### A4 — Rate limiting → **ผ่าน**

- คีย์เป็น `identity.userId` จาก session ไม่ใช่ header/IP — `knowledge-routes.ts:47-49`
  `const retryAfter = limiter.retryAfterSeconds(userId); if (retryAfter > 0) throw new HttpError(429, "RATE_LIMITED", retryAfter);`
- ทำงาน **ก่อน** อ่าน/แปลง body: upload `:85` enforce → `:86` `parseBoundedFormData`; search `:153` enforce → `:154` `readBoundedJson` และมีเทสต์ยืนยันว่า body เสียยังได้ 429 ก่อน 400 (`merchant-knowledge-routes.test.ts:189`)
- map มีเพดาน: `rate-limit.ts:8` `maxKeys = 10_000`, `:21-23` เคลียร์ key ที่หมดอายุก่อน แล้วจึงไล่ key เก่าสุดออก
- `Retry-After` เป็นวินาทีจำนวนเต็ม — `rate-limit.ts:14` `Math.ceil((current.resetAt - time) / 1_000)` + `http.ts:44-48`
- ไม่เพิ่ม dependency และมี `ponytail:` ระบุเพดาน multi-instance + การรีเซ็ตต่อ process — `rate-limit.ts:3-6`
- เทสต์เพดาน/การเปิดหน้าต่างใหม่: `merchant-knowledge-routes.test.ts:243-253`

### A5 — M2 load bounds → **ผ่าน (มีข้อ F4 เรื่องการตัด candidate)**

- bound ฝั่ง SQL ไม่ใช่ฝั่งแอป — `knowledge-repository.ts:686-687` `LIMIT $4` ด้วย `MAX_RETRIEVAL_CANDIDATES = 2_000` (`:31`) และแถวที่ส่งกลับไม่พก `version.content` แล้ว (สัญญา `contracts/data/knowledge.ts:185-189` เป็น `Pick<KnowledgeVersion, ...>`)
- shortlist ถูกส่งเป็นพารามิเตอร์ ไม่ใช่กรองในแอปหลังโหลดทั้งหมด — `knowledge-repository.ts:668-687` (`$2` terms, `$3` skuKeys, LATERAL fold/normalize)
- เพดาน term ฝั่ง query — `platform/modules/knowledge/index.ts:32` `MAX_SHORTLIST_TERMS = 64`, `:480` `sort(...).slice(0, MAX_SHORTLIST_TERMS)`
- worker PDF: `document-extractor.ts:27-28` `MAX_PDF_WORKERS = 2`, `MAX_PDF_QUEUE = 8`; `:126-128` เกินคิว → `failure("EXTRACTION_BUSY")`; intake แปลงเป็น 503 — `knowledge-intake.ts:155`; สล็อตคืนเฉพาะเมื่อ worker ตายจริง (`document-extractor.ts:144-148` `void worker.terminate().then(releasePdfWorker, releasePdfWorker)`)
- เทสต์: `document-extractor.test.ts` ยิง 12 งานพร้อมกัน ได้ `active=2/queued=8`, `EXTRACTION_BUSY` 2 ตัว, แล้วสล็อตกลับเป็น 0

### A6 — M3: ซ่อน LINE connection → **ผ่าน (มีข้อคลุมเครือในหัวข้อ 6)**

- policy ใหม่ — `20261103000100_host_hardening.sql:97-100`
  `USING (channel = 'web' AND aicp.is_active_workspace_member(workspace_id));`
- ไม่มี read surface อื่นอ่าน `workspace_connections` นอกจากนี้: `resolveMerchantIdentity` อ่านผ่าน client ของผู้ใช้ (RLS มีผล) และกรอง `channel: "web"` ซ้ำที่ `merchant-host-harness.ts:136-137` / production `workspace-membership-repository.ts`; route ทั้ง 4 ไม่ส่ง channel ออกไป
- เทสต์: staff เห็นแค่ `web-a` (`host-hardening-migration.test.ts:120-121`), owner ก็เห็นแค่ `web-a` (`:122-123`), route ตรวจ owner/staff ของจริงที่ `:133`
- unique index กัน connection ซ้ำที่ทำให้ login พัง (`WORKSPACE_AMBIGUOUS`): `:102-104` + เทสต์ `:126-130`

### A7 — รายการ Low ของ task → **ปิดครบทั้ง 6 ข้อ**

| ข้อ | สถานะ | หลักฐาน |
|---|---|---|
| `putOriginal`/`removeOriginal` กฎเดียวกัน | ปิด | `private-knowledge-storage.ts:9-15` `isWorkspaceObjectPath` ใช้ร่วมทั้ง upload (`:27-28`) และ delete (`:46-48`) |
| quarantine object ค้างเมื่อ replay | ปิด | `knowledge-intake.ts:107-110` ลบ object ที่เพิ่งสร้างเมื่อ record ชี้ path เดิม + `:111-114` ลบเมื่อเกิด error |
| แยก error ด้วย substring | ปิด | `knowledge-repository.ts:331-343` แมปด้วยรหัส SQLSTATE; `knowledge-intake.ts:29` ชุดชื่อ conflict; `http.ts:44-51` ไม่ส่งต่อ error ของ vendor ที่มี `{status, code}` |
| GET ไม่มี origin check | ปิด | `http.ts:18-26` `assertSameOriginRead` + เทสต์ `merchant-knowledge-routes.test.ts:82-90` |
| `"::1"` vs `[::1]` | ปิด (แก้ถูกฝั่ง) | `scripts/seed-environment.mjs:1` เปลี่ยนเป็น `["127.0.0.1", "localhost", "[::1]"]` ตรงกับ `new URL(...).hostname` ของ Node (ผมทดสอบเอง: `http://[::1]:54321` → `[::1]`) และยังบังคับพอร์ต 54321/54322 (`:47-48`) |
| duplicate web connection | ปิด | unique index `:102-104` + เทสต์ `:126-130` |

### A8 — การแมป error / การรั่วข้อมูล → **ผ่าน**

- `routeErrorResponse` ตัด duck-typed `{status, code}` ออกแล้ว — `http.ts:44-51` โดยที่ `:50` log แค่ `error.name` ไม่มี message/stack/path
- error แปลก → `500 REQUEST_FAILED` (`http.ts:51`) และมีเทสต์ยืนยันว่า error ที่แนบ `status:418` ปลอมมาได้ 500 (`merchant-knowledge-routes.test.ts:240`)
- adapter อนุมัติแมปเฉพาะรหัสที่รู้ (`knowledge-approval.ts:5`, `:20-22`) นอกนั้นโยน `KNOWLEDGE_APPROVAL_FAILED` → 500; ไม่มีข้อความจาก PostgREST หลุดถึง client

### A9 — secrets → **ผ่าน**

สแกน diff: ไม่มีรูปแบบคีย์/JWT/private key/project ref จริง `.env.example` เพิ่มเพียง comment อธิบายค่า default local ของ Supabase CLI (`git diff acb0e9e..7de2649 -- .env.example`) และ `scripts/seed-environment.mjs:9-13` บังคับให้ URL local ชี้ loopback พอร์ตตายตัวก่อนใช้ค่านั้น

### A10 — คุณภาพเทสต์ (assertion ถูกลบ/อ่อนลง) → **ผ่าน**

ตรวจ diff ของเทสต์เดิมทุกไฟล์: assertion ที่แก้มี 2 จุดใน `knowledge-repository.test.ts` เป็นการเปลี่ยนรูปสัญญา (`version` แบบย่อ) ไม่ใช่การลดความเข้ม; ไม่มีการลบเคสความปลอดภัย ไม่มี `skip`/`todo` เพิ่ม (`npm test` รายงาน `skipped 0`, `todo 0`)

ข้อสังเกตเล็ก (ไม่ใช่ finding): เทสต์ worker (`document-extractor.test.ts:18`) รอสล็อตคืนสูงสุด 5 วินาทีแบบ polling — เสี่ยง flaky บนเครื่องช้า แต่ไม่กระทบความปลอดภัย

### A11 — รันสด

```
$ npm run typecheck
> tsc --noEmit            (ไม่มี output, exit 0)

$ npm test
ℹ tests 216 · suites 0 · pass 216 · fail 0 · cancelled 0 · skipped 0 · todo 0
ℹ duration_ms 3921.4871
```

ตรงกับที่ task/ผู้สร้างอ้าง (216) ไม่มีเทสต์ถูกปิดเพื่อให้ผ่าน

### A12 — หลักฐานอิสระของผมเอง

probe ทั้ง 6 ตัวรันบน PGlite in-memory ที่ apply migration ทั้งโฟลเดอร์ตามลำดับ และสลับ role จริง (`authenticated`, `knowledge_runtime`) อยู่นอก repo ทั้งสิ้น

> **ข้อผิดพลาดของผมเองระหว่างรีวิว (บันทึกไว้เพื่อความโปร่งใส):** probe แรกของผมลืมตั้ง `app.workspace_id` ให้ role `knowledge_runtime` ผลคือ RLS กรองเหลือ 0 แถว แล้วรายงานว่า "ALLOWED" ทั้งที่ไม่มีแถวถูกแก้ ผมทิ้งผลนั้นและเขียน probe ใหม่ที่พิมพ์จำนวนแถวทุกครั้ง (probe2, probe5) ข้อสรุปทั้งหมดในรายงานนี้มาจาก probe ที่มี row count ยืนยันแล้วเท่านั้น

---

## 3. Findings

### F1 — MEDIUM — `knowledge_runtime` ยังถอน/เก็บความรู้ที่อนุมัติแล้วได้เอง และปลอมชื่อผู้ถอนได้

**อะไร:** M1 ตัดสิทธิ์ "อนุมัติ" ออกจาก ingest role ได้จริง แต่ยังเหลือ `UPDATE (status, revoked_at, revoked_by, revocation_reason)` ตาม `20261023000100_g1_workspace_host.sql:105` และ transition `approved → revoked` ถูกอนุญาตโดย `20261022000100_knowledge.sql:93` ผู้ถือ credential ของ runtime จึงถอนความรู้ที่ owner อนุมัติแล้วได้โดยไม่ต้องมีมนุษย์อนุมัติ และกำหนด `revoked_by` เป็นข้อความอะไรก็ได้ เพราะ CHECK บังคับแค่ว่ามีค่า (`knowledge.sql:34-35`) ไม่ได้ผูกกับ `auth.uid()` หรือ membership

**หลักฐาน (probe5 §2 และ §4 — มี row count):**

```
approved -> revoked, revoked_by='engine': ALLOWED rows=1 [{"status":"revoked","revoked_by":"engine"}]
   row: {"status":"revoked","approved_by":"...000a","revoked_by":"engine","revocation_reason":"superseded"}
repository.revokeVersion(revokedBy='not-a-user'): ALLOWED rows=1
   row: {"status":"revoked","approved_by":"...000a","revoked_by":"not-a-user"}
```

โค้ดที่ทำให้เกิด: `knowledge-repository.ts:601-618` ส่ง `input.revokedBy` ลง SQL ตรง ๆ ไม่มีการเทียบกับ session (ต่างจาก approve ที่ใช้ `auth.uid()`)

เส้นทางเดียวกันยังเก็บ source ทั้งก้อนได้ด้วย `UPDATE (status)` บน `knowledge_sources` (`g1:102`) — `archiveSource` (`knowledge-repository.ts:437-447`) ทำให้การค้นหาเห็น 0 แถว (probe5 §6: `retrievable rows for an archived source: [{"c":0}]`)

**สถานการณ์ล้มเหลว:** credential ของ `knowledge_runtime` รั่ว (หรือมีบั๊ก/injection ในเส้นทาง ingest ที่รัน SQL ได้) ผู้โจมตีไม่ต้องผ่าน owner ก็ปิดการตอบของร้านได้ทันที — ถอน approved version หรือ archive source ทุกอัน แล้วผู้ใช้ปลายทางจะได้ `no_answer` หรือ citation revalidation ล้ม (`knowledge-routes.ts:161-162` → 500) และ audit จะชี้ว่า "engine"/ข้อความปลอมเป็นผู้ถอน ทำให้สอบย้อนหลังไม่ได้

**ทำไมไม่ใช่ HIGH:** ต้องถือ credential ระดับ DB ก่อน, ไม่มี route ใดเรียก `revokeVersion`/`archiveSource` ในปัจจุบัน (grep เฉพาะ contracts, in-memory, synthetic baseline), และการถอน/เก็บเป็นความสามารถที่ระบบ ingest ต้องมีเพื่อแทนที่ความรู้เก่าตามดีไซน์ — แต่การไม่มี authorization สำหรับ "ใครถอนได้" คือช่องที่ควรปิดก่อนเรียกขอบเขตนี้ว่า hardened

**แนวทางแก้ (ต้นทุนต่ำ):** ทำ `aicp.revoke_knowledge_version(...)` แบบ SECURITY DEFINER ที่ดึงผู้ถอนจาก `auth.uid()` + ตรวจ owner/staff ตามนโยบาย แล้ว `REVOKE UPDATE (revoked_at, revoked_by, revocation_reason)` จาก `knowledge_runtime` (เหลือ `status` ไว้ให้ ingest ทำ supersede ได้ หรือถ้าต้องการเข้มกว่านั้นให้ถอน `status` ด้วยและให้ทุก transition ผ่านฟังก์ชัน) + เพิ่มเทสต์แบบเดียวกับ `host-hardening-migration.test.ts:36`

### F2 — MEDIUM — การตรวจ membership เป็น "fail-open โดยปริยาย" เมื่อไม่ได้ส่ง actor

**อะไร:** `assertActiveWriter` คืนค่าทันทีถ้า `actorUserId` เป็น `undefined` — `knowledge-repository.ts:348-349`

```ts
/** Re-checks the verified actor inside the caller's write transaction. No actor means no signed-in user exists, as in the base-schema tests. */
export async function assertActiveWriter(query, workspace, actorUserId: string | undefined): Promise<void> {
  if (actorUserId === undefined) return;
```

คอนสตรักเตอร์ก็ประกาศเป็น optional — `:365` `constructor(private readonly database: PostgresDatabasePort, private readonly actorUserId?: string) {}` และ audit ก็เหมือนกัน (`knowledge-intake-audit.ts:42`)

**หลักฐานว่าช่องนี้ทำงานจริง (probe1 P6):** หลัง revoke membership ของ owner แล้ว สร้าง repository โดยไม่ส่ง actor → `createSource` **สำเร็จ** และ `rows written: 1`

```
P6 repository constructed WITHOUT actorUserId, membership revoked:
   createSource: ALLOWED {"workspaceId":"shop-a","sourceId":"no-actor",...}
   rows written: 1
```

**สถานการณ์ล้มเหลว:** วันหนึ่งมี composition ใหม่ (job นำเข้าไฟล์, bulk import, adapter LINE, สคริปต์ ops) เรียก `new PostgresKnowledgeRepository(db)` โดยไม่ส่ง actor — TypeScript ไม่ฟ้อง เพราะพารามิเตอร์ optional — ผลคือด่านเดียวที่กัน "เพิกถอนสิทธิ์แล้วยังเขียนได้" หายไปเงียบ ๆ ทั้งระบบ และจะไม่มีใครรู้จนมีเหตุการณ์ เพราะเทสต์ก็สร้างแบบไม่มี actor เป็นปกติ (`knowledge-repository.test.ts:53`, `:144`, `:289`)

ปัจจุบัน production wiring ถูกต้อง (`merchant-knowledge-host.ts:13`, `:19-20` บังคับ `string`) และ route test พิสูจน์ race แล้ว (`merchant-knowledge-routes.test.ts:192`) — จึงยังไม่ใช่ช่องที่ใช้โจมตีได้ตอนนี้ แต่เป็น unsafe default ของ security control

**แนวทางแก้:** บังคับ actor ใน type (`actorUserId: string`) แล้วให้เทสต์ฐาน schema ใช้ factory แยกที่ระบุเจตนา (`PostgresKnowledgeRepository.forSchemaTests(...)`) หรือให้ `assertActiveWriter` โยน error เมื่อไม่มี actor; ถ้าจำเป็นต้องรองรับ "ไม่มีผู้ใช้" จริง ให้ทำเป็นธงที่ต้องประกาศชัด เช่น `assertActiveWriter(..., { allowAnonymous: true })`

### F3 — LOW — ฟังก์ชัน revalidation เชื่อ actor ที่ผู้เรียกส่งมา

`20261103000100_host_hardening.sql:7-23` รับ `actor_user_id text` จากผู้เรียกแล้วคืน role โดยไม่ผูกกับ session (ทำไม่ได้ เพราะ role `knowledge_runtime` ไม่ใช่ `authenticated`) — probe1 P5: เรียกด้วย `OWNER_A` แล้วได้ `owner`, เรียกด้วย `'nobody'` ได้ `AC001`

วันนี้ปลอดภัยเพราะผู้เรียกเดียวคือ adapter ที่ส่ง `identity.userId` จาก session (`host.ts:7`) และเส้นทางอนุมัติใช้ `auth.uid()` (`20261103000100_host_hardening.sql:43`) แต่ถ้ามีคนเขียน call site ใหม่ที่ส่งค่าจาก request ลงไป ด่านนี้จะกลายเป็น "เชื่อผู้ถาม" ทันที แนะนำเติม comment ห้ามใช้ค่าจาก request ที่ตัวฟังก์ชัน (ทำครึ่งเดียวที่ `:6`) และเพิ่มเทสต์ที่ยืนยันว่า adapter ไม่เคยส่งค่าที่ไม่ใช่ session

### F4 — LOW — ขอบเขตการค้นหาตัด candidate ที่อันดับต่ำได้ และ `LIMIT` ไม่ลดต้นทุนสแกน

`MAX_RETRIEVAL_CANDIDATES = 2_000` (`knowledge-repository.ts:31`) ตัดที่ **จำนวนแถวผลลัพธ์** แต่ query ยังต้อง fold/normalize/`strpos` ทุก chunk ของทุก version ที่ approved (`:674-687`) ต้นทุนจึงโตตามขนาดคลัง ไม่ใช่ตาม limit; เมื่อคลังใหญ่กว่า 2,000 chunk การเรียง `ORDER BY hits.sku_hits DESC, hits.term_hits DESC, ...` จะตัดแถวที่คะแนนต่ำกว่าออกก่อน scoring ฝั่งแอป ซึ่งเปลี่ยนคำตอบได้

อีกชั้น: คำค้นยาวที่มี term ต่างกันเกิน 64 ตัวจะส่งเฉพาะ term ที่ยาวที่สุด (`modules/knowledge/index.ts:480`) chunk ที่เข้าคู่เฉพาะ term ที่ถูกตัดจะไม่ถูกดึงมาเลย (คะแนนจะต่ำอยู่แล้วเพราะ normalize ด้วย `queryTerms.size` แต่ยังเป็นการเปลี่ยนพฤติกรรมจากเดิมที่โหลดทั้งหมด)

ยังไม่มีเทสต์ใดยืนยันว่า recall ไม่ลดเมื่อคลังใหญ่/คำค้นยาว และค่าทั้งสองเป็นค่าตั้งต้นที่ไม่ได้มาจากการวัด (ผู้สร้างระบุไว้เองในรายงาน — ดูหัวข้อ 7)

### F5 — LOW — unique index ของ web connection จะทำให้ migration ล้มทั้งชุดถ้ามีข้อมูลซ้ำอยู่ก่อน

`20261103000100_host_hardening.sql:102-104` สร้าง `CREATE UNIQUE INDEX workspace_one_active_web_connection` แบบธรรมดา ไม่มีขั้นตอนตรวจ/รวมแถวซ้ำก่อน ถ้า workspace ใดมี active web connection 2 แถว (ซึ่งเป็นสภาพที่ระบบเดิมยอมให้เกิด และเป็นสาเหตุที่ login พังเป็น `WORKSPACE_AMBIGUOUS` ตาม `merchant-identity.ts:37`) การ apply บน hosted จะล้มที่คำสั่งนี้ — ถ้าเครื่องมือ apply ห่อ migration ในทรานแซกชัน (ค่าเริ่มต้นของ Supabase CLI) ทั้งไฟล์จะถูกย้อนกลับ แต่ถ้าไม่ห่อ จะเหลือสภาพ apply ไม่ครบ ซึ่งอันตรายกว่า

ผลลัพธ์เชิงความปลอดภัยเป็น fail-closed จึงไม่รุนแรง แต่ควรมีสคริปต์ pre-check ระบุ workspace ที่มีแถวซ้ำก่อน apply (หรือให้ Owner ยืนยันว่า hosted ยังไม่มีข้อมูล production)

### F6 — LOW — approve route อาจตอบ error หลังจากอนุมัติ commit ไปแล้ว

`knowledge-routes.ts:140-143`

```ts
await approval.approve(identity.workspace, sourceId, versionId);
const version = await repository.getVersion(identity.workspace, sourceId, versionId);
if (!version) throw new KnowledgeError("VERSION_NOT_FOUND");
```

การอนุมัติเกิดผ่าน Supabase RPC (`knowledge-approval.ts:15-19`) ซึ่ง commit ก่อนบรรทัดถัดไป ถ้า read-back ล้ม (connection pool หมด, timeout, RLS/การตั้งค่าเปลี่ยน) client จะได้ 4xx/5xx ทั้งที่ DB อนุมัติแล้ว และเมื่อ retry จะได้ `APPROVAL_NOT_ELIGIBLE`/`APPROVED_VERSION_EXISTS` (400/409) — ผู้ใช้เห็น "อนุมัติไม่สำเร็จ" ทั้งที่สำเร็จ และ UI ไม่มีทางแยกแยะ

แนะนำ: ตอบ 200 ด้วยข้อมูลขั้นต่ำจาก RPC เมื่อ read-back ล้ม (หรืออ่านกลับด้วย retry สั้น ๆ) และเพิ่มเทสต์ที่บังคับให้ read-back ล้มหลัง approve สำเร็จ

---

## 4. ตรวจแล้วไม่พบปัญหา (เพื่อไม่ให้อ่านรายงานนี้แล้วเข้าใจว่ามีแต่ข้อเสีย)

- การแยกสิทธิ์อนุมัติแน่นจริงทั้ง 3 ชั้น: คอลัมน์, ตาราง, และฟังก์ชัน (probe1 P1/P2, probe5 §1–§3)
- ไม่มีการอนุมัติผ่าน `INSERT ... status='approved'` (42501) และไม่มี path อื่นในโค้ดที่เขียน `approved_*`
- `revoked` เป็น immutable จริง (`knowledge.sql:72-74`; probe5 §3 ปฏิเสธทั้งกรณีคงค่าและการล้าง `revoked_*`)
- ชั้น HTTP: origin แยก POST/GET ถูกต้อง, body ถูกจำกัดทั้งจาก `content-length` และระหว่าง stream (`http.ts:58-61`, `:102-109`), form field ไม่รู้จัก/ซ้ำถูกปฏิเสธ (`:137-140`), path ของ storage ตรวจรูป `workspace/source/version/file` ก่อน upload และก่อน delete
- ข้อความ error ไม่มี SQL/vendor text/path หลุด และไม่ส่ง stack (`http.ts:44-51`)
- idempotency + quarantine replay จัดการ object ที่ไม่ถูกอ้างถึงแล้ว (`knowledge-intake.ts:107-114`)
- ไม่มีคีย์หรือข้อมูลอ่อนไหวใน diff; `npm test` ไม่มี skip
- `archiveSource`/`revokeVersion` ไม่ถูกเรียกจาก route ใด (ตรวจด้วย grep ทั้ง `platform/`)

---

## 5. ช่องว่างที่ยังไม่ทดสอบ (และจะทำให้ข้อสรุปบางข้อเป็นได้แค่ "อนุมาน")

1. **race จริงระหว่าง revoke/suspend กับ write** — PGlite มี connection เดียว ได้แค่หลักฐานว่า `FOR SHARE` ถูกจับ (`RowShareLock` ทั้งสองตาราง) การบล็อกจริงเป็นพฤติกรรมที่เอกสาร PostgreSQL รับประกัน แต่ยังไม่มีหลักฐานสอง session บน Postgres จริง
2. **chunked upload เกินขนาดโดยไม่มี `content-length`** — โค้ดจำกัดระหว่าง stream (`http.ts:106-109`) แต่เทสต์ 413 ทั้งหมดส่ง `content-length` มาก่อน (`merchant-knowledge-routes.test.ts:96`) ยังไม่มีเทสต์ที่พิสูจน์เส้นทาง stream
3. **`EXTRACTION_BUSY` → 503 ที่ระดับ route** — มีเทสต์ที่ extractor (`document-extractor.test.ts`) และการแมปที่ `knowledge-intake.ts:155` แต่ไม่มีเทสต์ route ที่ยิง upload PDF เกินคิวจริง
4. **การคืนสล็อต worker เมื่อ crash/timeout ในโปรเซสอายุยาว** — เทสต์ยืนยันการคืนสล็อตหลัง 12 งาน แต่ไม่ครอบกรณี `terminate()` ค้างหรือ worker ตายแบบไม่ส่ง event
5. **ของจริงบน Supabase** — PostgREST RPC คืน `code: "AC001"` จริงหรือไม่, `auth.uid()` ใต้ SECURITY DEFINER, `getClaims()`, การตรวจ CA, `DROP POLICY`/`CREATE INDEX` ใต้เจ้าของตารางบน hosted: ทั้งหมดยังไม่เคยรัน (ผมตรวจได้แค่ PGlite + stub)
6. **production wiring `lib/host.ts`** — เทสต์ใช้ harness ที่ประกอบ host เอง (`merchant-host-harness.ts:148-154`) ไม่ได้เรียก `requireKnowledgeHost` ตัวจริง
7. **attribution ของการนำเข้า** — `KnowledgeIntakeInput.userId` (`knowledge-intake.ts:15`) ถูกประกาศแต่ไม่ถูกใช้เลย และตาราง `knowledge_sources`/`knowledge_versions`/`knowledge_quarantine_records` ไม่มีคอลัมน์ผู้สร้าง การนำเข้าจึงสอบย้อนหลังไม่ได้ว่าใครทำ (ต่างจาก approve/revoke ที่มีคอลัมน์)
8. **หลาย instance** — rate limit และเพดาน worker เป็น per-process (ระบุในโค้ดแล้ว) ไม่มีเทสต์หรือการวัดเมื่อรัน N instance
9. **ภาระค้นหาจริง** — ไม่มี load test ที่คลังใหญ่กว่า 2,000 chunk เพื่อดูทั้งเวลาและ recall (ข้อ F4)
10. **search ที่ชน revoke ระหว่างทาง** — `areKnowledgeCitationsCurrent` คืน false → โยน `Error("CITATION_REVALIDATION_FAILED")` → 500 (`knowledge-routes.ts:161-162`) เป็น fail-closed ที่ถูกต้อง แต่ไม่มีเทสต์และไม่มี retry/สถานะ 409 ที่ client แยกแยะได้

---

## 6. ความคลุมเครือ / เบี่ยงจาก task ที่ต้องให้ Owner ตัดสิน

1. **M3 ซ่อน LINE จาก owner ด้วย** — task เขียนว่า "members can read every connection row ... restrict the policy to `channel = 'web'` or owner-only" การเลือกทางแรกทำให้ owner ก็ไม่เห็น LINE connection (`host-hardening-migration.test.ts:122-123` ยืนยัน) ถ้าอนาคต console ต้องแสดงสถานะ LINE ให้ owner เห็น จะต้องแก้ policy เป็น `channel = 'web' OR is_owner(...)` ซึ่งไม่มีอยู่ในตอนนี้
2. **ไม่ทำตามคำสั่งตรงของ task เรื่อง grant** — task สั่ง "Add the required grant (`SELECT ON aicp.workspace_memberships TO knowledge_runtime`)" แต่ผู้สร้างใช้ SECURITY DEFINER แทน (ระบุในรายงานผู้สร้างข้อ 1) ผลลัพธ์เชิงสิทธิ์ **แคบกว่า** คำสั่ง (runtime ยังอ่านตารางตรงไม่ได้ — `host-hardening-migration.test.ts:116`) และผมทดสอบสมมติฐานนี้เองแล้ว (probe6): หลัง `GRANT SELECT ON aicp.workspace_memberships TO knowledge_runtime` runtime อ่านได้ **0 แถว** (policy มีผลเฉพาะ `TO authenticated`) และ `SELECT ... FOR SHARE` ยังถูกปฏิเสธ `42501` (ต้องมีสิทธิ์ UPDATE) — ดังนั้นการเบี่ยงไปใช้ SECURITY DEFINER เป็นทางเดียวที่ทำงานได้จริง และแคบกว่าคำสั่งเดิม แต่ยังต้องมี Owner sign-off ไม่ใช่ถือว่าปิดเอง
3. **ขอบเขต rate limit** — นับต่อ `userId` เท่านั้น ไม่แยก workspace/connection และไม่รวม IP ถ้าอนาคตผู้ใช้หนึ่งคนมีหลาย workspace (ตอนนี้ `WORKSPACE_AMBIGUOUS` บล็อกไว้ที่ `merchant-identity.ts:33`) ต้องทบทวนคีย์
4. **`revoked_*` ยังอยู่กับ runtime** — ผู้สร้างตั้งเป็นคำถามให้ผู้ตรวจ (รายงานข้อ 2) ผมตอบว่าเป็น Medium (F1) ไม่ใช่ Low เพราะผลกระทบคือ availability + integrity ของคำตอบ ไม่ใช่แค่เรื่องความสะอาดของสิทธิ์
5. **ค่าเพดานทั้งหมดเป็นค่าตั้งต้น** — 2,000 candidates, 64 terms, 2 workers, 8 queued, 20/60 requests per minute ไม่มีที่มาจากการวัด และไม่มีเอกสารกำกับว่าใครต้องวัดเมื่อไร
6. **ใครมีสิทธิ์อัปโหลด** — route อนุญาตทั้ง owner และ staff (`knowledge-routes.ts:136` จำกัดเฉพาะ approve) ผมถือว่าเป็นเจตนา (staff นำเข้า, owner อนุมัติ) แต่ task ไม่ได้เขียนไว้ตรง ๆ จึงบันทึกเป็นสมมติฐาน

---

## 7. ตรวจสอบเพิ่มหลังอ่านรายงานผู้สร้าง (informed verification)

อ่าน `reports/host-002-2026-11-03/REPORT.md` **หลัง** สรุป findings ข้างบนแล้ว เพื่อเทียบว่ามีข้อใดที่ผู้สร้างปิด/รับไว้แล้วบ้าง

| ข้อของผู้สร้าง | ตรงกับผมไหม | หมายเหตุ |
|---|---|---|
| M1/M2/M3 "ปิดในโค้ด" | ตรงกับหลักฐานของผม (A1, A5, A6) | ผมยืนยันเองด้วย probe ไม่ได้รับมาทั้งหมด |
| "credential ของ runtime อนุมัติเองไม่ได้" | ตรง (A1) | แต่ยังถอน/archive ได้ (F1) ซึ่งผู้สร้างรับไว้ที่ข้อ 2 ของ "การตัดสินใจ" |
| "membership ที่ถูกเพิกถอนเขียนไม่ได้" | ตรงเมื่อมี actor (A2) | ไม่ครอบ fail-open default (F2) ซึ่งรายงานผู้สร้างไม่ได้พูดถึง |
| "ไม่พบรูปแบบคีย์" | ตรง (A9) | — |
| "เทสต์ใหม่ที่ผ่านตั้งแต่ก่อนแก้เป็นตัวล็อกพฤติกรรม ไม่ใช่หลักฐานการแก้" | ตรงและซื่อสัตย์ | ผมตรวจ diff แล้วไม่มี assertion ความปลอดภัยถูกลบ |
| คำถามข้อ 2: `revoked_*` อยู่กับ runtime | ตรงกับ F1 | ผมจัดเป็น Medium ไม่ใช่รับได้เฉย ๆ |
| คำถามข้อ 5: term >64 และ candidate >2,000 อาจทำให้ผลอันดับต่ำหาย | ตรงกับ F4 | ผู้สร้างเปิดเผยไว้แล้ว ผมจึงไม่ถือว่าเป็นการปกปิด แต่ยังไม่มีเทสต์/การวัด |
| ข้อจำกัด: ไม่เคยรัน hosted, race จริง, `auth.uid()` ใต้ definer, `Sec-Fetch-Site` จริง | ตรงกับหัวข้อ 5 ของผม | ยืนยันว่าข้อจำกัดที่ผู้สร้างยอมรับนั้นครบและไม่มีการกล่าวอ้างเกินหลักฐาน |
| "Independent reviewer ... no actionable High/Medium" | ยังไม่ผ่าน | เพราะ F1/F2 เป็น Medium ที่แก้ได้ถูก |

ข้อที่รายงานผู้สร้างไม่ได้กล่าวถึง แต่ผมพบ: F2 (fail-open), F3 (caller-supplied actor), F5 (unique index กับข้อมูลซ้ำ), F6 (approve แล้ว read-back ล้ม) — ทั้ง 4 ข้อไม่ขัดกับคำอ้างใดของผู้สร้าง แต่เป็นช่องที่ควรบันทึกก่อนปิดขอบเขตนี้

---

## 8. สรุปและข้อเสนอ

**สถานะ:** โค้ดทำสิ่งที่ task สั่งได้ครบ (M1/M2/M3 + low items + เทสต์ route + rate limit + revalidation) และหลักฐานยืนยันว่า "อนุมัติเองไม่ได้" จริง แต่ยังเหลือช่องที่ทำให้เรียกขอบเขตนี้ว่า hardened ได้ไม่เต็มปาก

**ลำดับที่ควรทำก่อน merge/ปิดงาน:**

1. F1 — ย้าย revoke/archive ไปฟังก์ชันที่ยึด `auth.uid()` และถอน `UPDATE (revoked_*)` จาก runtime (ปิดช่องถอนความรู้โดยไม่ได้รับอนุญาต + ปลอมชื่อผู้ถอน)
2. F2 — ทำ actor เป็น required หรือให้ error เมื่อขาด เพื่อไม่ให้ security control หายเงียบ
3. F6 — จัดการ read-back หลัง approve ให้ client แยกแยะได้ (ต้นทุนต่ำ ทำพร้อมกันได้)
4. F3/F4/F5 — เติม comment/เทสต์/สคริปต์ pre-check ตามที่ระบุ

ถ้า Owner เลือก "รับความเสี่ยง" แทนการแก้ ต้องบันทึกเป็น carried risk พร้อมเจ้าของและวันหมดอายุ เพราะเกณฑ์ acceptance ของ `TASK-HOST-002` ข้อ "no actionable High/Medium findings" ยังไม่ผ่านตามตัวอักษร

**ข้อจำกัดของรีวิวนี้:** เป็นรีวิวโค้ด + PGlite ไม่ใช่ pen test บน hosted; ไม่ได้ตรวจ build ของ Next.js (`build:console`) ตามคำสั่ง; ไม่ได้ตรวจ CI run ID ที่ผู้สร้างอ้าง (ตรวจได้แค่การรันในเครื่อง)

---

CRITICAL=0 HIGH=0 MEDIUM=2 LOW=4

DONE
