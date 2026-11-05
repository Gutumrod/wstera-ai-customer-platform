# Runbook (DRAFT): G1 E2E บนโปรเจกต์ Supabase ทดสอบแยก

**สถานะ: DRAFT / NOT RUN / UNREVIEWED** · ระดับที่อ้างได้สูงสุด **BUILD_PASS** · ไม่มีขั้นตอนใดในไฟล์นี้เคยถูกรันกับ Supabase จริง

> **เอกสารนี้ไม่ใช่การอนุญาต** การ apply migration, seed, แก้ dashboard และรัน E2E แต่ละอย่างต้องมี Owner GO ที่ **ระบุชื่อโปรเจกต์ทดสอบ** ก่อนเสมอ GO ที่ไม่ระบุชื่อ หรือ GO ของ `wstera-lab` ใช้ไม่ได้ ห้ามรันกับโปรเจกต์ที่ใช้ร่วมกับของอื่น repo นี้เป็น public: ห้ามใส่ project ref จริง, key, URL ที่มี password, หรืออีเมลที่ไม่ใช่ `@example.test` ลงไฟล์นี้หรือ commit ใด ๆ

อ้างอิงคำตัดสิน: D-20261103-31 (เป้า E2E = โปรเจกต์ Supabase ทดสอบแยก; พบในทะเบียน `vault-rules/06-Agent-Logs/WSTERA-House/DECISIONS-REGISTER.md` สถานะ LOCKED ตรวจเมื่อ 2026-11-05 · repo นี้ไม่มีสำเนาของคำตัดสิน), D-20261025-11 (schema `aicp` เท่านั้น ห้าม `public` ห้าม Docker Desktop) · ที่มาของรายการความเสี่ยง: `plans/HANDOFF-2026-11-03.md` ข้อ 4 และ 6 บน branch `claude/project-thread-8xgsii` (draft PR #27) ซึ่งตรวจซ้ำกับโค้ดแล้วในหัวข้อ 1 (เทียบ main @b080d57)

## 0. ก่อนเริ่ม: เงื่อนไขที่ต้องครบ (NOT RUN)

- [ ] Owner GO เป็นลายลักษณ์อักษรที่ระบุ **ชื่อโปรเจกต์ทดสอบ** และแยก GO ตามขั้น: apply, seed, แก้ Data API, รัน E2E
- [ ] โปรเจกต์เป็นของใหม่ ใช้แล้วรื้อทิ้ง ไม่มีข้อมูลหรือผู้ใช้จริง (preflight ข้อ 3 ตรวจให้บางส่วน)
- [ ] มี host ของ **Session pooler** รูปแบบ `aws-N-<region>.pooler.supabase.com` (ตัวเลข N และ region ดูจากหน้า Connect ของโปรเจกต์) โค้ดปฏิเสธ host ตรงและ host รูปแบบอื่น (`platform/composition/knowledge-database-url.ts:12`, `scripts/seed-environment.mjs:23`)
- [ ] อีเมลเจ้าของสังเคราะห์ (`LOCAL_OWNER_EMAIL`) ต้องลงท้าย `@example.test` (`scripts/seed-environment.mjs:26`)
- [ ] เครื่องรัน: Node.js 22.13+ และ npm (`npm ci` ทำโดย operator เอง ไม่ใช่ในเอกสารนี้), `psql` (ใช้ apply แบบ SQL ตรง), ที่เก็บ secret ที่ไม่ใช่ repo
- [ ] ค่าทุกตัวอยู่ใน `.env.local` (ถูก ignore โดย `.gitignore` บรรทัด 10-15) ห้าม echo/print ห้ามวางในแชต ถ้าเห็นค่า key หลุดใน output ให้หยุดและแจ้ง Owner ทันที

## 1. ผลตรวจซ้ำ 5 จุดสัมผัสของ PR #27 กับโค้ดจริง

| # | ข้ออ้างใน PR #27 | ผลตรวจ | หลักฐาน (`path:line`) |
|---|---|---|---|
| 1 | role `aicp_migrator`/`knowledge_runtime` สร้างถ้าไม่มี ชื่อซ้ำแล้ว `ALTER ROLE` ทับ | **ถูกบางส่วน และแคบเกินไป** `aicp_migrator` ถ้ามีอยู่จะถูกบังคับ `NOLOGIN NOSUPERUSER ... NOINHERIT` ทับ (ตัดสิทธิ์ login ของ role เดิม) ส่วน `knowledge_runtime` migration ทับเฉพาะ attribute ไม่แตะ LOGIN แต่ **seed** สั่ง `ALTER ROLE knowledge_runtime LOGIN PASSWORD` เป็นจุดสัมผัสที่ 6 ที่ PR #27 ไม่ได้ลง และ seed ตรวจแค่ไม่ใช่ superuser/bypassrls ดังนั้น role ชื่อซ้ำที่ไม่ใช่ superuser จะถูกตั้ง password ทับโดยไม่ถูกเตือน | `supabase/migrations/20261023000100_g1_workspace_host.sql:71-76`, `:93-98`, `scripts/seed-local.mjs:28-33` |
| 2 | bucket `knowledge-originals` private 5 MB `ON CONFLICT DO UPDATE` | **ถูก** และเพิ่ม: ทับ `allowed_mime_types` ด้วย (4 ชนิด) ไม่ทับ `name` | `...g1_workspace_host.sql:157-161` |
| 3 | FK ไป `auth.users`, `GRANT USAGE ON SCHEMA auth`, seed สร้างผู้ใช้สังเคราะห์ 1 คน | **ถูก** seed สร้างผ่าน Auth Admin API (`email_confirm: true`) ไม่ใช่ SQL และถ้าอีเมลซ้ำจะค้นด้วย `listUsers` หน้าแรก 1000 คนเท่านั้น (โปรเจกต์ใหญ่อาจหาไม่เจอ → `LOCAL_AUTH_USER_NOT_FOUND`) | `...g1_workspace_host.sql:11`, `:90`, `scripts/seed-local.mjs:14-23` |
| 4 | Data API ต้อง expose `aicp` โดยต่อท้าย และ PostgREST reload cache | **ส่วน "ต้อง expose" ถูก** (โค้ดเรียก `.schema("aicp")` ผ่าน Data API) **ส่วน "ต่อท้ายห้ามแทนที่" และ "reload schema cache" ไม่มีใน repo = UNVERIFIED** (เป็นพฤติกรรมของ dashboard/PostgREST ที่ repo ไม่พิสูจน์) | `platform/adapters/persistence/supabase/workspace-membership-repository.ts:9`, `knowledge-approval.ts:15`, `README.md:57`, `:70` ไม่พบ `NOTIFY pgrst` ใน repo |
| 5 | Pooler: ใช้ connection ร่วม | **ถูก** โค้ดบังคับ pooler เท่านั้น (`aws-N-*.pooler.supabase.com`, พอร์ต 5432/6543, db `postgres`, ไม่มี query/fragment, user `knowledge_runtime.<ref>` สำหรับ runtime และ `postgres.<ref>` สำหรับ seed) ปฏิเสธ host ตรง | `platform/composition/knowledge-database-url.ts:12-16`, `scripts/seed-environment.mjs:22-25` |
| ไม่แตะ | ไม่มี `CREATE EXTENSION`, ไม่แตะ `public` | **ถูก** ตามที่อ่านทั้ง 5 ไฟล์ ไม่พบ `CREATE EXTENSION` และทุก object อยู่ใน `aicp` (ยกเว้น role/bucket ข้างบน) | `supabase/migrations/*.sql` (ทั้งห้าไฟล์) |

รายการ env ของ PR #27 ข้อ 6 **ขาด**: `NEXT_PUBLIC_APP_URL` (เช็ค same-origin ถ้าไม่ตั้งทุก POST ถูก 403 `ORIGIN_DENIED`, `platform/apps/merchant-console/lib/http.ts:10-11`), `KNOWLEDGE_RUNTIME_PASSWORD` (บังคับ 64 hex, `scripts/seed-environment.mjs:39-40`; seed ตั้งเป็น password ของ role และต้องตรงกับ password ใน `DATABASE_URL`), และ `LOCAL_OWNER_PASSWORD` (ยาว >= 20, `:42-43`) นอกจากนี้ seed ต้องการ `APP_ENV=lab` (`:35`) และ `NEXT_PUBLIC_APP_ENV=lab` (`:18`)

ช่องว่างอีกข้อ: seed สร้าง workspace เดียว `synthetic-shop` กับเจ้าของหนึ่งคน (`scripts/seed-local.mjs:34-48`) จึงยังไม่มีข้อมูลสำหรับทดสอบ **cross-workspace denial** ต้องเตรียมเพิ่มตามขั้น 6 ในข้อ 3

ความเสี่ยงที่ยังไม่รู้ (UNVERIFIED): บัญชี `postgres.<ref>` บน hosted มีสิทธิ์พอสำหรับ `ALTER SCHEMA aicp OWNER TO aicp_migrator` (`...g1_workspace_host.sql:77`) หรือไม่ และ `GRANT USAGE ON SCHEMA auth` (`:90`) ผ่านหรือไม่ ถ้า apply ล้มที่สองบรรทัดนี้ ให้หยุดตามข้อ 5 ห้ามแก้สิทธิ์เพิ่มเอง

## 2. env var (ชื่อเท่านั้น ห้ามใส่ค่าในไฟล์นี้)

ตั้งใน `.env.local` ที่ root ของ repo; ค่าที่ต้องเทียบกัน:

| ชื่อ | ใช้ตอน | กฎที่โค้ดบังคับ |
|---|---|---|
| `APP_ENV`, `NEXT_PUBLIC_APP_ENV` | seed + host | ทั้งคู่ต้องเป็น `lab` |
| `SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_PROJECT_REF` | seed + host | ค่าเดียวกัน 20 ตัว `[a-z0-9]` |
| `NEXT_PUBLIC_SUPABASE_URL` | seed + host | ต้องเท่ากับ `https://<ref>.supabase.co` เป๊ะ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | host | publishable key |
| `NEXT_PUBLIC_APP_URL` | host | origin ที่เปิดในเบราว์เซอร์ (ค่า local ใน `.env.example:4` คือ `http://127.0.0.1:3000`) |
| `SUPABASE_SECRET_KEY` | seed + host (storage, admin) | server-only |
| `DATABASE_URL` | host | pooler, user `knowledge_runtime.<ref>`, password = `KNOWLEDGE_RUNTIME_PASSWORD`, ไม่มี query string |
| `SUPABASE_DB_CA_CERT` | seed + host | PEM ที่มี `BEGIN CERTIFICATE` ถ้าไม่มี หน้า login เปิดได้แต่ทุก route ที่สร้าง host ล้ม |
| `SUPABASE_DB_ADMIN_URL` | seed เท่านั้น (+ ใช้กับ `psql` ตอน apply) | pooler, user `postgres.<ref>` เอา **ออก** จาก `.env.local` หลังเสร็จ |
| `KNOWLEDGE_RUNTIME_PASSWORD` | seed เท่านั้น | 64 hex (สร้างเองด้วยเครื่องมือสุ่ม ห้ามใช้ซ้ำกับที่อื่น) |
| `LAB_SEED_CONFIRM_PROJECT_REF` | seed เท่านั้น | เท่ากับ project ref |
| `LOCAL_OWNER_EMAIL`, `LOCAL_OWNER_PASSWORD` | seed เท่านั้น | อีเมลลงท้าย `@example.test`; password ยาว >= 20 |

## 3. ขั้นตอน (ทุกขั้น NOT RUN)

ทุกขั้นที่เขียนฐานข้อมูลต้องมี Owner GO ที่ระบุชื่อโปรเจกต์ และต้องเก็บ **raw output** (ตัดค่า secret ออกก่อนบันทึก: ห้ามให้สตริงรูปแบบ key เช่น `AIza...`, `sb_secret_...`, `eyJ...`, password ใน URL ติดไปในไฟล์หลักฐาน)

1. **ตรวจผูกชื่อ** Owner ยืนยันชื่อโปรเจกต์ + ref ตรงกับ GO ที่ได้รับ [NOT RUN]
2. **Owner dashboard ล่วงหน้า (ดาวน์โหลด CA cert):** Project Settings > Database > SSL certificate > ดาวน์โหลด CA ใส่ใน `SUPABASE_DB_CA_CERT` [NOT RUN]
3. **Preflight (อ่านอย่างเดียว):** `psql "<SUPABASE_DB_ADMIN_URL>" -X -f scripts/e2e-preflight.sql` เก็บ output ถ้ามีแถวใด `STOP` หรือ VERDICT = `STOP` **หยุดทันที** ไม่ apply (ดูข้อ 5) [NOT RUN]
4. **Apply** 5 ไฟล์ตามลำดับ (ลำดับชื่อไฟล์ = ลำดับ apply) ใช้พอร์ต 5432 (session mode) ถ้าเป็นไปได้ [NOT RUN; UNVERIFIED ว่า transaction mode 6543 ใช้กับ DDL ได้]
   ```
   psql "<SUPABASE_DB_ADMIN_URL>" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261022000100_knowledge.sql
   psql "<SUPABASE_DB_ADMIN_URL>" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261023000100_g1_workspace_host.sql
   psql "<SUPABASE_DB_ADMIN_URL>" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261103000100_host_hardening.sql
   psql "<SUPABASE_DB_ADMIN_URL>" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261103000200_host_hardening_revoke.sql
   psql "<SUPABASE_DB_ADMIN_URL>" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261104000100_knowledge_visibility.sql
   ```
   ถ้าไฟล์ใดล้ม หยุด เก็บ error ดิบ ห้ามรันซ้ำจนกว่าจะเข้าใจสาเหตุ (ไม่มี down migration; ดู `scripts/e2e-rollback.sql`) · apply ครบแล้วให้รัน SQL ตรวจหลัง apply ในหัวข้อ 4 ก่อน seed
5. **Owner dashboard: expose schema `aicp`** Project Settings > API (Data API) > Exposed schemas: **เพิ่ม** `aicp` ต่อท้ายรายการเดิม ห้ามแทนที่รายการ แล้วบันทึก; ตรวจว่า schema cache รีเฟรชแล้ว (วิธีที่แน่ชัด UNVERIFIED) [NOT RUN]
6. **Seed:** ตั้ง env ตามข้อ 2 แล้ว `npm run seed:local` สำเร็จควรพิมพ์ `Seeded one lab synthetic owner, workspace, and web connection.` seed สั่ง `ALTER ROLE knowledge_runtime LOGIN PASSWORD` (ปลอดภัยเฉพาะเมื่อ preflight ผ่าน) และสร้าง workspace `synthetic-shop` [NOT RUN]
   - **เตรียมข้อมูล cross-workspace (ไม่มีใน seed):** (ก) สร้างผู้ใช้ที่สองใน dashboard Authentication ด้วยอีเมล `@example.test` **โดยไม่ให้ membership**; (ข) ถ้าต้องการข้อมูลของ workspace อื่น ให้ operator แทรก workspace `other-shop` ด้วย SQL แบบ admin ที่ตรวจเองแล้ว (ยังไม่มีสคริปต์ใน repo ร่างนี้) แล้วบันทึกคำสั่งที่ใช้เป็นหลักฐาน
7. **เริ่ม host แบบ lab:** `npm run dev:console` (ผูก 127.0.0.1:3000; รัน `tsc` ก่อน) เปิด `http://127.0.0.1:3000/login` [NOT RUN]
8. **ตรวจ E2E** ตามเช็กลิสต์ข้อ 4 เก็บ log ของ terminal ที่รัน host, network/console จากเบราว์เซอร์ (ตัด cookie/token), และ output SQL ตรวจยืนยัน
9. **จบงาน:** ลบ `SUPABASE_DB_ADMIN_URL`, `SUPABASE_SECRET_KEY` ออกจาก `.env.local`, แล้วรื้อโปรเจกต์ทดสอบทั้งก้อน (ทางที่แนะนำ) หรือใช้ `scripts/e2e-rollback.sql` (ไม่เคยลอง) ตามเงื่อนไขในหัวไฟล์

## 4. เช็กลิสต์ E2E (ทุกข้อ NOT RUN)

ผ่านต้องมีหลักฐานแนบ ไม่ใช่แค่ติ๊ก

- [ ] **Sign-in:** login ด้วยเจ้าของสังเคราะห์ที่ `/login` สำเร็จ หน้าแรกเห็น workspace `synthetic-shop` เท่านั้น (ใช้ `getClaims` จากเบราว์เซอร์; ยังไม่เคยพิสูจน์ตาม PR #26 รายงานเอง)
- [ ] **Upload:** อัปโหลด FAQ/PDF/CSV สังเคราะห์ขนาด <= 5 MB สำเร็จ แถวขึ้นใน `aicp.knowledge_sources/versions`, ต้นฉบับอยู่ใน bucket `knowledge-originals` (private)
- [ ] **Review:** เห็นข้อความที่สกัดและ chunk ก่อนอนุมัติ สถานะ `indexed`
- [ ] **Approve:** เจ้าของกดอนุมัติ ผ่าน RPC `aicp.approve_knowledge_version` (`...host_hardening.sql:36-92`) สถานะ `approved`, `approved_by` = uid ของเจ้าของ (ยังไม่เคยรัน `auth.uid()` ใต้ SECURITY DEFINER กับ PostgREST จริง)
- [ ] **Search + citation:** ค้นแล้วได้คำตอบแบบ extractive พร้อม citation ชี้ source/version/locator; เวอร์ชันที่ยังไม่อนุมัติต้องไม่ถูกคืน (กรณี revoke ทดสอบผ่านหน้าเว็บไม่ได้ ดูหัวข้อ 7)
- [ ] **Cross-workspace denial:** (ก) ผู้ใช้คนที่สองที่ไม่มี membership: login ได้แต่ต้องไม่ได้ workspace ใด และ upload/approve/search ถูกปฏิเสธ (`MEMBERSHIP_REQUIRED`); (ข) ข้อมูลของ workspace อื่น (ถ้าเตรียมไว้) ต้องไม่ปรากฏในผลค้นของ `synthetic-shop`; (ค) POST ที่ไม่มี/ผิด `Origin` ต้อง 403
- [ ] **Negative:** staff (ไม่ใช่ owner) อนุมัติไม่ได้ (`OWNER_ROLE_REQUIRED`) *(ต้องมีผู้ใช้ staff เพิ่ม ซึ่ง seed ไม่ได้สร้าง; ถ้าไม่เตรียม ให้บันทึกว่า "ไม่ได้ทดสอบ")*

- [ ] **แชตลูกค้า (ทำได้เมื่อโฮสต์จริงของแชต merge แล้ว):** หน้าแชตตอบจากเอกสารที่ visibility = `customer` พร้อม citation และไม่ตอบจากเอกสาร visibility = `internal` (ต้องเตรียมเอกสารสังเคราะห์ทั้งสองชนิดและอนุมัติทั้งคู่) *(ณ @b080d57 มี route แชต `platform/composition/web-chat-routes.ts` แต่ยังไม่มีหน้าเว็บของ merchant-console; ข้อนี้ยังทำไม่ได้)*

### SQL ตรวจหลัง apply (อ่านอย่างเดียว ยังไม่เคยรัน)

รันด้วย `psql "<SUPABASE_DB_ADMIN_URL>" -X` หลัง apply ครบ 5 ไฟล์ ทั้งสามคอลัมน์ต้องเป็น 2 / 2 / 1 ตามลำดับ ค่าอื่นให้หยุดตามหัวข้อ 5 เก็บ output ดิบ

```sql
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'aicp' AND p.proname IN ('revoke_knowledge_version', 'archive_knowledge_source')) AS revoke_archive_functions_expect_2,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'aicp' AND NOT t.tgisinternal
      AND t.tgname IN ('knowledge_source_identity_guard', 'knowledge_version_visibility_guard')) AS triggers_expect_2,
  (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'aicp' AND c.relname = 'knowledge_versions' AND a.attname = 'visibility'
      AND a.attnum > 0 AND NOT a.attisdropped) AS visibility_column_expect_1;
```

## 5. เงื่อนไขหยุด (STOP)

หยุดทันที เก็บ output ดิบ แจ้ง Owner ห้ามลองซ้ำ/แก้เอง เมื่อ:

- preflight มีแถว `STOP` ใด ๆ (ชื่อ role/bucket/schema/function/trigger/คอลัมน์ชน, มีผู้ใช้จริง, ไม่มี role `authenticated`)
- migration ล้ม (โดยเฉพาะที่ `ALTER SCHEMA ... OWNER`, `GRANT USAGE ON SCHEMA auth`, `storage.buckets`)
- ref/URL/ชื่อโปรเจกต์ที่เห็นไม่ตรงกับชื่อใน GO
- โค้ดหรือสคริปต์ throw `LAB_*_REQUIRED`/`*_MISMATCH` (อย่าแก้ guard ให้ผ่าน)
- ค่า secret ปรากฏใน terminal/log/แชต
- ต้องแตะ `wstera-lab`, schema `public`, Docker Desktop, หรือโปรเจกต์ที่ไม่ใช่ของทดสอบ

## 6. หลักฐานที่ต้องเก็บ (ตัด secret ก่อนบันทึก)

คำสั่งที่รันจริงแต่ละบรรทัด (ไม่มี password ใน URL), output ดิบของ preflight ก่อนและหลัง apply, output ดิบของ psql แต่ละไฟล์ migration, output seed, log terminal ของ `dev:console`, บันทึกแต่ละข้อของเช็กลิสต์ (ผ่าน/ล้ม + ภาพหรือ response ตัด token), commit SHA ของ repo ที่รัน, เวลา, ชื่อผู้รัน, ชื่อโปรเจกต์ (ไม่ใส่ ref ใน repo; เก็บใน vault) · ถ้าทุกข้อผ่าน ระดับที่อ้างได้สูงสุดคือ "รันครั้งเดียวบนโปรเจกต์ทดสอบ" **ไม่ใช่** LIVE_PROVEN หรือ PRODUCTION_READY และ G1 acceptance ยังต้องมีการตรวจอิสระแยกต่างหาก

## 7. UNVERIFIED ของไฟล์นี้

คำตัดสิน D-20261103-31 พบในทะเบียน vault แล้ว (LOCKED) แต่ไม่มีสำเนาใน repo · **ข้อจำกัด revoke/archive:** ณ @b080d57 ยังไม่มี route หรือ UI ใดเรียก `SupabaseKnowledgeRevocation` (`platform/adapters/persistence/supabase/knowledge-revocation.ts:17` ถูกอ้างถึงเฉพาะในเทสต์/harness) จึงทดสอบ revoke และ archive ผ่านหน้าเว็บไม่ได้ ตรวจได้เพียงว่าฟังก์ชันมีอยู่ตาม SQL หลัง apply; การเรียกจริงต้องรอ route · SQL ตรวจหลัง apply (หัวข้อ 4) และการเช็กชื่อชนใน preflight ข้อ 21 ยังไม่เคยรันกับ Postgres · ข้อที่เพิ่มในหัวข้อ 4 (แชตลูกค้า) ยังไม่มีโฮสต์ให้ทดสอบ · วิธี "ต่อท้าย" Data API และการ reload cache · `postgres.<ref>` มีสิทธิ์พอสำหรับ ownership/grant · DDL ผ่าน pooler โหมด 6543 · preflight และ rollback SQL ยังไม่เคย parse/รันกับ Postgres · `storage.objects` ลบด้วย SQL ได้หรือไม่ · พฤติกรรม `getClaims`/`Sec-Fetch-Site` จากเบราว์เซอร์จริง · การค้นหา setting `pgrst.db_schemas` ใน preflight
