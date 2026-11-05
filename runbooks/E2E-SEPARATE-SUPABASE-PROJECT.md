# Runbook (DRAFT): G1 E2E บนโปรเจกต์ Supabase ทดสอบแยก

**สถานะ: DRAFT / NOT RUN / UNREVIEWED** · ระดับที่อ้างได้สูงสุด **BUILD_PASS** · ไม่มีขั้นตอนใดในไฟล์นี้เคยถูกรันกับ Supabase จริง

> **เอกสารนี้ไม่ใช่การอนุญาต** การ apply migration, seed, แก้ dashboard และรัน E2E แต่ละอย่างต้องมี Owner GO ที่ **ระบุชื่อโปรเจกต์ทดสอบ** ก่อนเสมอ GO ที่ไม่ระบุชื่อ หรือ GO ของ `wstera-lab` ใช้ไม่ได้ ห้ามรันกับโปรเจกต์ที่ใช้ร่วมกับของอื่น repo นี้เป็น public: ห้ามใส่ project ref จริง, key, URL ที่มี password, หรืออีเมลที่ไม่ใช่ `@example.test` ลงไฟล์นี้หรือ commit ใด ๆ

อ้างอิงคำตัดสิน: D-20261103-31 (เป้า E2E = โปรเจกต์ Supabase ทดสอบแยก; พบในทะเบียน `vault-rules/06-Agent-Logs/WSTERA-House/DECISIONS-REGISTER.md` สถานะ LOCKED ตรวจเมื่อ 2026-11-05 · repo นี้มีเพียงแถวสรุปที่ `architecture/CORE-CONTRACT-v0.1.md:19` ไม่มีเนื้อคำตัดสินเต็ม), D-20261025-11 (schema `aicp` เท่านั้น ห้าม `public` ห้าม Docker Desktop) · ที่มาของรายการความเสี่ยง: `plans/HANDOFF-2026-11-03.md` ข้อ 4 และ 6 บน branch `claude/project-thread-8xgsii` (draft PR #27) ซึ่งตรวจซ้ำกับโค้ดแล้วในหัวข้อ 1 (เทียบ main @b080d57)

## 0. ก่อนเริ่ม: เงื่อนไขที่ต้องครบ (NOT RUN)

- [ ] Owner GO เป็นลายลักษณ์อักษรที่ระบุ **ชื่อโปรเจกต์ทดสอบ** และแยก GO ตามขั้น: apply, seed, แก้ Data API, รัน E2E
- [ ] โปรเจกต์เป็นของใหม่ ใช้แล้วรื้อทิ้ง ไม่มีข้อมูลหรือผู้ใช้จริง (preflight แถว ord 60 ตรวจผู้ใช้ให้บางส่วน)
- [ ] มี host ของ **Session pooler** รูปแบบ `aws-N-<region>.pooler.supabase.com` (ตัวเลข N และ region ดูจากหน้า Connect ของโปรเจกต์) โค้ดปฏิเสธ host ตรงและ host รูปแบบอื่น (`platform/composition/knowledge-database-url.ts:12`, `scripts/seed-environment.mjs:23`)
- [ ] อีเมลเจ้าของสังเคราะห์ (`LOCAL_OWNER_EMAIL`) ต้องลงท้าย `@example.test` (`scripts/seed-environment.mjs:26`)
- [ ] เครื่องรัน: Node.js 22.13+ และ npm (`npm ci` ทำโดย operator เอง ไม่ใช่ในเอกสารนี้), `psql` (ใช้ apply แบบ SQL ตรง; เครื่องที่ตรวจร่างนี้ไม่มี `psql` จึงยังไม่เคยลองคำสั่งจริง), ที่เก็บ secret ที่ไม่ใช่ repo
- [ ] ค่าทุกตัวอยู่ใน `.env.local` (ถูก ignore โดย `.gitignore` บรรทัด 10-15) ห้าม echo/print ห้ามวางในแชต ถ้าเห็นค่า key หลุดใน output ให้หยุดและแจ้ง Owner ทันที

## 1. ผลตรวจซ้ำ 5 จุดสัมผัสของ PR #27 กับโค้ดจริง

| # | ข้ออ้างใน PR #27 | ผลตรวจ | หลักฐาน (`path:line`) |
|---|---|---|---|
| 1 | role `aicp_migrator`/`knowledge_runtime` สร้างถ้าไม่มี ชื่อซ้ำแล้ว `ALTER ROLE` ทับ | **ถูกบางส่วน และแคบเกินไป** `aicp_migrator` ถ้ามีอยู่จะถูกบังคับ `NOLOGIN NOSUPERUSER ... NOINHERIT` ทับ (ตัดสิทธิ์ login ของ role เดิม) ส่วน `knowledge_runtime` migration ทับเฉพาะ attribute ไม่แตะ LOGIN แต่ **seed** สั่ง `ALTER ROLE knowledge_runtime LOGIN PASSWORD` เป็นจุดสัมผัสที่ 6 ที่ PR #27 ไม่ได้ลง และ seed ตรวจแค่ไม่ใช่ superuser/bypassrls ดังนั้น role ชื่อซ้ำที่ไม่ใช่ superuser จะถูกตั้ง password ทับโดยไม่ถูกเตือน | `supabase/migrations/20261023000100_g1_workspace_host.sql:71-76`, `:93-98`, `scripts/seed-local.mjs:28-33` |
| 2 | bucket `knowledge-originals` private 5 MB `ON CONFLICT DO UPDATE` | **ถูก** และเพิ่ม: ทับ `allowed_mime_types` ด้วย (4 ชนิด) ไม่ทับ `name` | `...g1_workspace_host.sql:157-161` |
| 3 | FK ไป `auth.users`, `GRANT USAGE ON SCHEMA auth`, seed สร้างผู้ใช้สังเคราะห์ 1 คน | **ถูก** seed สร้างผ่าน Auth Admin API (`email_confirm: true`) ไม่ใช่ SQL และถ้าอีเมลซ้ำจะค้นด้วย `listUsers` หน้าแรก 1000 คนเท่านั้น (โปรเจกต์ใหญ่อาจหาไม่เจอ → `LOCAL_AUTH_USER_NOT_FOUND`) | `...g1_workspace_host.sql:11`, `:90`, `scripts/seed-local.mjs:14-23` |
| 4 | Data API ต้อง expose `aicp` โดยต่อท้าย และ PostgREST reload cache | **ส่วน "ต้อง expose" ถูก** (โค้ดเรียก `.schema("aicp")` ผ่าน Data API) **ส่วน "ต่อท้ายห้ามแทนที่" และ "reload schema cache" ไม่มีใน repo = UNVERIFIED** (เป็นพฤติกรรมของ dashboard/PostgREST ที่ repo ไม่พิสูจน์) | `platform/adapters/persistence/supabase/workspace-membership-repository.ts:9`, `knowledge-approval.ts:15`, `README.md:57`, `:70` ไม่พบ `NOTIFY pgrst` ในโค้ด/migration (มีเฉพาะใน comment ของ `scripts/e2e-rollback.sql`) |
| 5 | Pooler: ใช้ connection ร่วม | **ถูก** โค้ดบังคับ pooler เท่านั้น (`aws-N-*.pooler.supabase.com`, พอร์ต 5432/6543, db `postgres`, ไม่มี query/fragment, user `knowledge_runtime.<ref>` สำหรับ runtime และ `postgres.<ref>` สำหรับ seed) ปฏิเสธ host ตรง | `platform/composition/knowledge-database-url.ts:12-16`, `scripts/seed-environment.mjs:22-25` |
| ไม่แตะ | ไม่มี `CREATE EXTENSION`, ไม่แตะ `public` | **ถูก** ตามที่อ่านทั้ง 5 ไฟล์ ไม่พบ `CREATE EXTENSION` และทุก object อยู่ใน `aicp` (ยกเว้น role/bucket ข้างบน) | `supabase/migrations/*.sql` (ทั้งห้าไฟล์) |

รายการ env ของ PR #27 ข้อ 6 **ขาด**: `NEXT_PUBLIC_APP_URL` (เช็ค same-origin ถ้าไม่ตั้งทุก POST ถูก 403 `ORIGIN_DENIED`, `platform/apps/merchant-console/lib/http.ts:10-11`), `KNOWLEDGE_RUNTIME_PASSWORD` (บังคับ 64 hex, `scripts/seed-environment.mjs:39-40`; seed ตั้งเป็น password ของ role และต้องตรงกับ password ใน `DATABASE_URL`), และ `LOCAL_OWNER_PASSWORD` (ยาว >= 20, `:42-43`; HANDOFF ข้อ 6 เขียนเป็นคำพูดว่า "รหัสผ่านเจ้าของสังเคราะห์" โดยไม่มีชื่อตัวแปร จึงขาดเฉพาะชื่อ) นอกจากนี้ seed ต้องการ `APP_ENV=lab` (`:35` ยอมรับ `local` ด้วย; ด่านที่บังคับ lab คือ `:45-48` ผ่าน `assertLab`) และ `NEXT_PUBLIC_APP_ENV=lab` (`:18`)

ช่องว่างอีกข้อ: seed สร้าง workspace เดียว `synthetic-shop` กับเจ้าของหนึ่งคน (`scripts/seed-local.mjs:34-48`) จึงยังไม่มีข้อมูลสำหรับทดสอบ **cross-workspace denial** ต้องเตรียมเพิ่มตามขั้น 7 ในข้อ 3

ความเสี่ยงที่ยังไม่รู้ (**UNVERIFIED จนกว่าจะมีผล Probe ในขั้น 4 ข้อ 3**): บัญชี `postgres.<ref>` บน hosted ทำสิ่งเหล่านี้ได้หรือไม่ ทั้งหมดอยู่ใน `...g1_workspace_host.sql`: `CREATE ROLE`/`ALTER ROLE aicp_migrator` (`:73`, `:76`), `ALTER SCHEMA/TABLE/FUNCTION ... OWNER TO aicp_migrator` (`:77-88`) ซึ่งใน PostgreSQL ผู้รันต้อง SET ROLE เป็น role ปลายทางได้ (ถ้าไม่ใช่ superuser), `GRANT SELECT ... TO aicp_migrator` (`:89`) และ `GRANT USAGE ON SCHEMA auth` (`:90`) ซึ่งต้องมี grant option บน schema `auth` และ GRANT ต่อ ๆ มาของ object ที่โอนเจ้าของไปแล้ว (`:99-107`, `:139-154`) นอกจากนี้หลังโอนเจ้าของ `scripts/seed-local.mjs:34-48` ต้อง INSERT ลงตารางที่ `aicp_migrator` เป็นเจ้าของผ่านบัญชีเดียวกัน (RLS เปิดอยู่ policy ของตาราง workspace ให้เฉพาะ `authenticated`) ผลทั้งหมดบน hosted ยังไม่มีใครรู้ **ห้ามเดา** ให้รัน Probe แล้วเทียบเกณฑ์; ถ้าเกณฑ์เข้าข่ายล้มหรือ apply ล้มที่บรรทัดเหล่านี้ ให้หยุดตามข้อ 5 ห้ามแก้สิทธิ์เพิ่มเอง (เช่น ห้าม `GRANT aicp_migrator TO` บัญชีที่ต่อ) จนกว่า Owner จะ GO ทางแก้

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
| `SUPABASE_DB_CA_CERT` | seed + host | PEM ที่มี `BEGIN CERTIFICATE` ถ้าไม่มี หน้า login เปิดได้แต่ทุก route ที่สร้าง host ล้ม · `.env.local` เป็นบรรทัดเดียว: ใส่ในเครื่องหมายคำพูดคู่และแทนการขึ้นบรรทัดของ PEM ด้วย `\n` (UNVERIFIED ว่า dotenv ของ Next ที่ติดตั้งขยาย `\n` ตามนี้ ดูผลที่ว่า seed ผ่านด่าน `BEGIN CERTIFICATE`); PEM ดิบหลายบรรทัดไม่ใส่ quote ทำให้คีย์ถัดไปอ่านเพี้ยน |
| `SUPABASE_DB_ADMIN_URL` | seed + `psql` ทุกคำสั่งในไฟล์นี้ | pooler, user `postgres.<ref>`, ไม่มี query string (โค้ดปฏิเสธ จึงใส่ `sslmode` ใน URL ไม่ได้ ใช้ `PGSSLMODE` แทน) · `psql` อ่านจากตัวแปรนี้เสมอ ห้ามวาง URL ในบรรทัดคำสั่ง · เอา **ออก** จาก `.env.local` หลังเสร็จ |
| `PGSSLMODE`, `PGSSLROOTCERT` | `psql` เท่านั้น (ตั้งใน shell ของ operator ไม่ต้องอยู่ใน `.env.local`) | `PGSSLMODE=verify-full` และ `PGSSLROOTCERT` = path ไฟล์ CA (ดูข้อ 3) ไม่ใช่ secret แต่ path ต้องอยู่นอก repo |
| `KNOWLEDGE_RUNTIME_PASSWORD` | seed เท่านั้น | 64 hex (สร้างเองด้วยเครื่องมือสุ่ม ห้ามใช้ซ้ำกับที่อื่น) |
| `LAB_SEED_CONFIRM_PROJECT_REF` | seed เท่านั้น | เท่ากับ project ref |
| `LOCAL_OWNER_EMAIL`, `LOCAL_OWNER_PASSWORD` | seed เท่านั้น | อีเมลลงท้าย `@example.test`; password ยาว >= 20 |

## 3. ขั้นตอน (ทุกขั้น NOT RUN)

ทุกขั้นที่เขียนฐานข้อมูลต้องมี Owner GO ที่ระบุชื่อโปรเจกต์ และต้องเก็บ **raw output** (ตัดค่า secret ออกก่อนบันทึก: ห้ามให้สตริงรูปแบบ key เช่น `AIza...`, `sb_secret_...`, `eyJ...`, password ใน URL ติดไปในไฟล์หลักฐาน)

**กติกาการเชื่อมต่อ `psql` (ใช้กับทุกคำสั่งในไฟล์นี้ รวม `scripts/*.sql`):**

- คำสั่งอ่าน URL จากตัวแปรสภาพแวดล้อมเท่านั้น: `psql "$SUPABASE_DB_ADMIN_URL" ...` ห้ามวาง URL (ซึ่งมี password) ในบรรทัดคำสั่ง ห้ามแทนที่ placeholder ด้วยค่าจริงในคำสั่งที่พิมพ์ ห้ามเขียนค่าลงไฟล์หลักฐาน
- นำค่าเข้าตัวแปรโดยไม่พิมพ์ค่าบนบรรทัดคำสั่งและไม่ echo เช่นพิมพ์ `read -rs SUPABASE_DB_ADMIN_URL; export SUPABASE_DB_ADMIN_URL` แล้ววางค่าที่ prompt (ไม่แสดงบนจอ ไม่เข้า history) หรือโหลดจากที่เก็บ secret นอก repo · ห้ามรัน `env`, `set`, `printenv` หรือ `echo "$SUPABASE_DB_ADMIN_URL"` ใน session นี้
- ตรวจ TLS เต็มรูปแบบ: ตั้ง `PGSSLMODE=verify-full` และ `PGSSLROOTCERT=<path ไฟล์ CA นอก repo>` ก่อนรัน `psql` ใด ๆ (libpq อ่านสองตัวแปรนี้เอง; `sslmode=verify-full` ใน URL ทำไม่ได้เพราะโค้ดปฏิเสธ URL ที่มี query) ไฟล์ CA คือไฟล์ที่ดาวน์โหลดจาก dashboard ในขั้น 2 (เก็บไว้นอก repo; เนื้อเดียวกับที่ใส่ใน `SUPABASE_DB_CA_CERT`) ถ้า `psql` รายงานว่า verify ล้ม (certificate / hostname) = **STOP** ห้ามลด `sslmode` ลง
- ผลที่ถือว่ายังไม่ปลอดภัยที่จะ apply: `psql` exit code ไม่ใช่ 0, มีข้อความ `ERROR`, หรือมี `WARNING: no privileges were granted` / `no privileges could be revoked` (GRANT/REVOKE ที่ไม่ได้ผลจะเป็นแค่ WARNING และ `ON_ERROR_STOP` ไม่หยุดให้) → STOP
- หลักฐานบันทึกคำสั่งในรูปที่ใช้ชื่อตัวแปร (`psql "$SUPABASE_DB_ADMIN_URL" -X ...`) เท่านั้น
- ทุกคำสั่งใช้ `-X` (ไม่อ่าน `.psqlrc`); คำสั่งที่เขียนใช้ `-v ON_ERROR_STOP=1`

1. **ตรวจผูกชื่อ** Owner ยืนยันชื่อโปรเจกต์ + ref ตรงกับ GO ที่ได้รับ [NOT RUN]
2. **Owner dashboard ล่วงหน้า (ดาวน์โหลด CA cert):** Project Settings > Database > SSL certificate > ดาวน์โหลด CA ใส่ใน `SUPABASE_DB_CA_CERT` และเก็บไฟล์ CA เดียวกันนอก repo สำหรับ `PGSSLROOTCERT` [NOT RUN]
3. **Preflight (อ่านอย่างเดียว):** `psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 -f scripts/e2e-preflight.sql` เก็บ output ดิบ · **ผ่านก็ต่อเมื่อครบทุกข้อ:** exit code 0, ไม่มีข้อความ `ERROR`, มีแถว `VERDICT` สถานะ `OK`, ไม่มีแถว `STOP`, และบรรทัดสุดท้ายคือ `PREFLIGHT_COMPLETE` · **อย่างอื่นทั้งหมดคือ STOP** รวมถึง: คำสั่งล้ม/exit code ไม่ใช่ 0, ผลว่าง 0 แถว, ไม่มีแถว `VERDICT`, ไม่มี `PREFLIGHT_COMPLETE` (การตรวจไม่จบ = ไม่ได้ตรวจ ไม่ใช่ "ไม่พบปัญหา") · แถว `identity:` 3 แถว (database, user, server version) ต้องเทียบกับ GO/หน้า Connect ของโปรเจกต์ที่ระบุ ถ้าไม่ตรง STOP (ดูข้อ 5) [NOT RUN]
4. **Probe สิทธิ์ของผู้เชื่อมต่อ (อ่านอย่างเดียว) ก่อน Apply:** ตอบว่า `postgres.<ref>` บน hosted ผ่านบรรทัดสิทธิ์ใน `...g1_workspace_host.sql:73-100` และ seed INSERT ที่ `scripts/seed-local.mjs:34-48` ได้หรือไม่ **ห้ามเดา** · รัน SQL เดียวนี้ (ไม่แก้อะไร):
   ```
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
   SELECT current_setting('server_version') AS server_version,
          current_setting('server_version_num')::int AS server_version_num,
          current_database() AS db,
          r.rolname AS connected_user,
          r.rolsuper, r.rolcreaterole, r.rolbypassrls, r.rolinherit,
          has_database_privilege(r.oid, current_database(), 'CREATE') AS can_create_in_db,
          current_setting('createrole_self_grant', true) AS createrole_self_grant,
          (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'auth') AS auth_schema_owner,
          has_schema_privilege(r.oid, 'auth', 'USAGE WITH GRANT OPTION') AS auth_usage_grantable,
          (SELECT string_agg(g.rolname || ' ' || (to_jsonb(m) - 'oid' - 'roleid' - 'member' - 'grantor')::text, '; ' ORDER BY g.rolname)
             FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid WHERE m.member = r.oid) AS member_of
   FROM pg_roles r WHERE r.rolname = current_user;
   SQL
   ```
   ได้ 1 แถว (0 แถว หรือ error = STOP) · `createrole_self_grant` เป็น NULL บน PostgreSQL ก่อน 16 · `member_of` แสดงเฉพาะ role ที่บัญชีนี้เป็นสมาชิกอยู่ **ก่อน** apply (`aicp_migrator` ยังไม่มีจึงไม่อยู่ในรายการ; ในรุ่น 16+ แสดงค่า admin/inherit/set ของแต่ละสมาชิกภาพ)

   **เกณฑ์ตัดสิน** (อนุมานจากกติกาของ PostgreSQL ไม่ใช่จากการลองบน hosted = **UNVERIFIED**; ถ้าข้อใดเข้าข่าย ให้ **STOP รายงาน Owner พร้อมผลดิบ ห้าม apply**):

   | ผล probe (แถวที่ 2-6 ใช้เมื่อ `rolsuper` = false; `g1` = `supabase/migrations/20261023000100_g1_workspace_host.sql`) | คำสั่งที่ล้ม | บรรทัดอ้างอิง |
   |---|---|---|
   | `rolcreaterole` = false | `CREATE ROLE aicp_migrator` / `ALTER ROLE` | `g1:73`, `g1:76`, `g1:95`, `g1:98` |
   | `can_create_in_db` = false | `ALTER SCHEMA aicp OWNER TO` (ต้องมี CREATE บนฐานข้อมูล) | `g1:77` |
   | `server_version_num` < 160000, หรือ `createrole_self_grant` เป็น NULL/ว่าง/ไม่มีคำว่า `set` | `ALTER SCHEMA/TABLE/FUNCTION ... OWNER TO aicp_migrator` ล้ม เพราะบัญชีไม่ได้เป็นสมาชิกที่ SET ROLE เป็น `aicp_migrator` ได้ (role นี้เพิ่งถูกสร้างใน migration เดียวกัน; การเป็นสมาชิกอัตโนมัติเกิดได้เฉพาะ PG16+ ตามค่า `createrole_self_grant`) และ GRANT ของ object ที่โอนเจ้าของแล้วก็ล้ม/ไม่ได้ผลตาม | `g1:77-88`, `g1:89`, `g1:99-107`, `g1:139-154` |
   | `auth_usage_grantable` = false | `GRANT USAGE ON SCHEMA auth TO aicp_migrator` ล้ม หรือเป็นแค่ WARNING `no privileges were granted` (migration ผ่านแต่ FK/policy ที่อ่าน `auth` ภายหลังจะพัง) | `g1:90` |
   | `createrole_self_grant` ไม่มีคำว่า `inherit` (และไม่ใช่ superuser) | **migration ผ่านได้ แต่ seed INSERT ล้ม** หลังโอนเจ้าของ: ตาราง `workspaces`/`workspace_memberships`/`workspace_connections` เป็นของ `aicp_migrator` บัญชีที่ต่อไม่มี INSERT (และเปิด RLS โดย policy ให้เฉพาะ `authenticated`); `rolbypassrls` = true ข้าม RLS ได้แต่ **ไม่ให้สิทธิ์ตาราง** จึงไม่ช่วย | `seed-local.mjs:34-48` เทียบ `g1:83-85` |
   | `rolsuper` = true | ไม่เข้าเกณฑ์ข้างบนข้อใด (superuser ข้ามทุกด่านนี้) แต่บน hosted ที่ได้ superuser ถือว่าผิดคาด → รายงานผลดิบให้ Owner ดูก่อน | - |

   ผลอื่นที่ไม่เข้าเกณฑ์ใดเลย **ไม่ใช่การรับรองว่า apply จะผ่าน** แค่ว่ายังไม่พบเหตุให้หยุดจาก probe นี้ (ผลจริงมาจาก apply เท่านั้น) · ห้ามแก้เกณฑ์ที่ล้มด้วยการ `GRANT aicp_migrator TO ...`, `ALTER ROLE ... CREATEROLE`, หรือแก้ migration/seed เอง ต้องให้ Owner ตัดสินทางแก้เป็น GO แยก [NOT RUN]
5. **Apply** 5 ไฟล์ตามลำดับ (ลำดับชื่อไฟล์ = ลำดับ apply) ใช้พอร์ต 5432 (session mode) ถ้าเป็นไปได้ · ทำเมื่อ preflight ผ่านและ probe ไม่เข้าเกณฑ์ล้มเท่านั้น [NOT RUN; UNVERIFIED ว่า transaction mode 6543 ใช้กับ DDL ได้]
   ```
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261022000100_knowledge.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261023000100_g1_workspace_host.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 -f scripts/check-web-connection-duplicates.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261103000100_host_hardening.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261103000200_host_hardening_revoke.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261104000100_knowledge_visibility.sql
   ```
   คำสั่งที่สามคือ pre-check ก่อน migration ที่สามตามที่ `README.md` กำหนด (ต้องได้ 0 แถว; บนโปรเจกต์ใหม่ตารางว่างจึงควรว่างเสมอ ถ้ามีแถว STOP) · ตรวจ output ของทุกคำสั่งตามกติกา `WARNING: no privileges...` ด้านบน · ถ้าไฟล์ใดล้ม หยุด เก็บ error ดิบ ห้ามรันซ้ำจนกว่าจะเข้าใจสาเหตุ (ไม่มี down migration; ดู `scripts/e2e-rollback.sql`) · apply ครบแล้วให้รัน SQL ตรวจหลัง apply ในหัวข้อ 4 ก่อน seed
6. **Owner dashboard: expose schema `aicp`** Project Settings > API (Data API) > Exposed schemas: **เพิ่ม** `aicp` ต่อท้ายรายการเดิม ห้ามแทนที่รายการ แล้วบันทึก; ตรวจว่า schema cache รีเฟรชแล้ว (วิธีที่แน่ชัด UNVERIFIED) [NOT RUN]
7. **Seed:** ตั้ง env ตามข้อ 2 แล้ว `npm run seed:local` สำเร็จควรพิมพ์ `Seeded one lab synthetic owner, workspace, and web connection.` seed สั่ง `ALTER ROLE knowledge_runtime LOGIN PASSWORD` (ปลอดภัยเฉพาะเมื่อ preflight ผ่าน) และสร้าง workspace `synthetic-shop` [NOT RUN]
   - **ล้มกลางทางได้:** `ALTER ROLE ... LOGIN PASSWORD` (`seed-local.mjs:32-33`) รันก่อน INSERT (`:34-48`) ถ้า INSERT ล้ม (เช่นตามเกณฑ์ใน probe ขั้น 4) role จะเป็น LOGIN พร้อม password แล้วแต่ไม่มีข้อมูล = สภาพครึ่งทาง ให้ STOP รายงาน Owner เก็บ error ดิบ ห้ามรัน seed ซ้ำ
   - **password ในคำสั่ง DDL:** seed ส่ง `ALTER ROLE ... PASSWORD '<ค่า>'` เป็น SQL ปกติ จึงอาจถูกบันทึกใน statement log ของเซิร์ฟเวอร์ (UNVERIFIED ว่า hosted log คำสั่งนี้หรือไม่; ไม่แก้ได้ในเอกสารนี้ เพราะต้องแก้ `scripts/seed-local.mjs`) ใช้ `KNOWLEDGE_RUNTIME_PASSWORD` ที่สุ่มใหม่เฉพาะโปรเจกต์ทดสอบนี้ และถือว่าเผาทิ้งพร้อมโปรเจกต์
   - **เตรียมข้อมูล cross-workspace (ไม่มีใน seed):** (ก) สร้างผู้ใช้ที่สองใน dashboard Authentication ด้วยอีเมล `@example.test` **โดยไม่ให้ membership**; (ข) ถ้าต้องการข้อมูลของ workspace อื่น ให้ operator แทรก workspace `other-shop` ด้วย SQL แบบ admin ที่ตรวจเองแล้ว (ยังไม่มีสคริปต์ใน repo ร่างนี้) แล้วบันทึกคำสั่งที่ใช้เป็นหลักฐาน
8. **เริ่ม host แบบ lab:** `npm run dev:console` (ผูก 127.0.0.1:3000; รัน `tsc` ก่อน) เปิด `http://127.0.0.1:3000/login` · ดู log ของ terminal ว่า host ฟังพอร์ตที่ตรงกับ `NEXT_PUBLIC_APP_URL` จริง ถ้าพอร์ต 3000 ถูกใช้อยู่ Next อาจเลื่อนไปพอร์ตอื่น ทำให้ origin ไม่ตรงและทุก POST ถูก 403 `ORIGIN_DENIED` (`lib/http.ts:10-11`) → ปิดตัวที่ใช้พอร์ตแล้วเริ่มใหม่ ห้ามแก้ค่าให้ผ่านโดยไม่เข้าใจ [NOT RUN]
9. **ตรวจ E2E** ตามเช็กลิสต์ข้อ 4 เก็บ log ของ terminal ที่รัน host, network/console จากเบราว์เซอร์ (ตัด cookie/token), และ output SQL ตรวจยืนยัน
10. **จบงาน:** ลบ `SUPABASE_DB_ADMIN_URL`, `SUPABASE_SECRET_KEY`, `KNOWLEDGE_RUNTIME_PASSWORD`, `LOCAL_OWNER_PASSWORD`, `DATABASE_URL`, `SUPABASE_DB_CA_CERT` และค่า ref ออกจาก `.env.local`, ปิด shell ที่ตั้ง `SUPABASE_DB_ADMIN_URL`/`PGSSLROOTCERT` (หรือ `unset`) และลบไฟล์ CA ที่ดาวน์โหลด, หมุน/ลบ key ของโปรเจกต์ถ้าเคยวางที่อื่นนอก `.env.local`, แล้วรื้อโปรเจกต์ทดสอบทั้งก้อน (ทางที่แนะนำ) หรือใช้ `scripts/e2e-rollback.sql` (ไม่เคยลอง) ตามเงื่อนไขในหัวไฟล์

## 4. เช็กลิสต์ E2E (ทุกข้อ NOT RUN)

ผ่านต้องมีหลักฐานแนบ ไม่ใช่แค่ติ๊ก

- [ ] **Sign-in:** login ด้วยเจ้าของสังเคราะห์ที่ `/login` สำเร็จ หน้าแรกเห็น workspace `synthetic-shop` เท่านั้น (ใช้ `getClaims` จากเบราว์เซอร์; ยังไม่เคยพิสูจน์ตาม PR #26 รายงานเอง)
- [ ] **Upload:** อัปโหลด FAQ/PDF/CSV สังเคราะห์ขนาด <= 5 MB สำเร็จ แถวขึ้นใน `aicp.knowledge_sources/versions`, ต้นฉบับอยู่ใน bucket `knowledge-originals` (private)
- [ ] **Review:** เห็นข้อความที่สกัดและ chunk ก่อนอนุมัติ สถานะ `indexed`
- [ ] **Approve:** เจ้าของกดอนุมัติ ผ่าน RPC `aicp.approve_knowledge_version` (`...host_hardening.sql:36-89`; `:90-92` คือ OWNER/REVOKE/GRANT) สถานะ `approved`, `approved_by` = uid ของเจ้าของ (ยังไม่เคยรัน `auth.uid()` ใต้ SECURITY DEFINER กับ PostgREST จริง)
- [ ] **Search + citation:** ค้นแล้วได้คำตอบแบบ extractive พร้อม citation ชี้ source/version/locator; เวอร์ชันที่ยังไม่อนุมัติต้องไม่ถูกคืน (กรณี revoke ทดสอบผ่านหน้าเว็บไม่ได้ ดูหัวข้อ 7)
- [ ] **Cross-workspace denial:** (ก) ผู้ใช้คนที่สองที่ไม่มี membership: login ได้แต่ต้องไม่ได้ workspace ใด และ upload/approve/search ถูกปฏิเสธ (`MEMBERSHIP_REQUIRED`); (ข) ข้อมูลของ workspace อื่น (ถ้าเตรียมไว้) ต้องไม่ปรากฏในผลค้นของ `synthetic-shop`; (ค) POST ที่ไม่มี/ผิด `Origin` ต้อง 403
- [ ] **Negative:** staff (ไม่ใช่ owner) อนุมัติไม่ได้ (`OWNER_ROLE_REQUIRED`) *(ต้องมีผู้ใช้ staff เพิ่ม ซึ่ง seed ไม่ได้สร้าง; ถ้าไม่เตรียม ให้บันทึกว่า "ไม่ได้ทดสอบ")*

- [ ] **แชตลูกค้า (ทำได้เมื่อโฮสต์จริงของแชต merge แล้ว):** หน้าแชตตอบจากเอกสารที่ visibility = `customer` พร้อม citation และไม่ตอบจากเอกสาร visibility = `internal` (ต้องเตรียมเอกสารสังเคราะห์ทั้งสองชนิดและอนุมัติทั้งคู่) *(ณ @b080d57 มี route แชต `platform/composition/web-chat-routes.ts` แต่ยังไม่มีหน้าเว็บของ merchant-console; ข้อนี้ยังทำไม่ได้)*

### SQL ตรวจหลัง apply (อ่านอย่างเดียว ยังไม่เคยรัน)

รันด้วย `psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1` (วาง SQL ด้านล่างทาง stdin) หลัง apply ครบ 5 ไฟล์ ทั้งสามคอลัมน์ต้องเป็น 2 / 2 / 1 ตามลำดับ ค่าอื่นให้หยุดตามหัวข้อ 5 เก็บ output ดิบ

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
- preflight หรือ probe **ไม่จบ**: `psql` exit code ไม่ใช่ 0, มี `ERROR`, ผลว่าง, ไม่มีแถว `VERDICT`, ไม่มีบรรทัด `PREFLIGHT_COMPLETE` (ห้ามตีความว่า "ไม่มี STOP = ผ่าน")
- แถว `identity:` ของ preflight / ผล probe (database, user, server version) ไม่ตรงกับโปรเจกต์ใน GO
- ผล probe เข้าเกณฑ์ล้มข้อใดในขั้น 4 (ห้ามลอง apply เพื่อดูว่าล้มจริงไหม)
- `psql` แจ้ง TLS verify ล้ม หรือ output มี `WARNING: no privileges were granted` / `no privileges could be revoked`
- migration ล้ม (โดยเฉพาะที่ `ALTER SCHEMA ... OWNER`, `GRANT USAGE ON SCHEMA auth`, `storage.buckets`)
- ref/URL/ชื่อโปรเจกต์ที่เห็นไม่ตรงกับชื่อใน GO
- โค้ดหรือสคริปต์ throw `LAB_*_REQUIRED`/`*_MISMATCH` (อย่าแก้ guard ให้ผ่าน)
- ค่า secret ปรากฏใน terminal/log/แชต
- ต้องแตะ `wstera-lab`, schema `public`, Docker Desktop, หรือโปรเจกต์ที่ไม่ใช่ของทดสอบ

## 6. หลักฐานที่ต้องเก็บ (ตัด secret ก่อนบันทึก)

คำสั่งที่รันจริงแต่ละบรรทัดในรูปที่ใช้ **ชื่อตัวแปร** (เช่น `psql "$SUPABASE_DB_ADMIN_URL" -X ...`; ห้ามมีค่า URL/password และห้ามคัดลอกค่าจาก `env`), ค่า `PGSSLMODE` ที่ใช้ (ต้องเป็น `verify-full`) และชื่อไฟล์ CA (ไม่ใส่เนื้อไฟล์), output ดิบของ preflight (รวมแถว `identity:`) ก่อน apply, output ดิบของ probe, preflight/SQL ตรวจหลัง apply, output ดิบของ psql แต่ละไฟล์ migration, output seed, log terminal ของ `dev:console`, บันทึกแต่ละข้อของเช็กลิสต์ (ผ่าน/ล้ม + ภาพหรือ response ตัด token), commit SHA ของ repo ที่รัน, เวลา, ชื่อผู้รัน, ชื่อโปรเจกต์ (ไม่ใส่ ref ใน repo; เก็บใน vault) · ถ้าทุกข้อผ่าน ระดับที่อ้างได้สูงสุดคือ "รันครั้งเดียวบนโปรเจกต์ทดสอบ" **ไม่ใช่** LIVE_PROVEN หรือ PRODUCTION_READY และ G1 acceptance ยังต้องมีการตรวจอิสระแยกต่างหาก

## 7. UNVERIFIED ของไฟล์นี้

คำตัดสิน D-20261103-31 พบในทะเบียน vault แล้ว (LOCKED) repo มีเพียงแถวสรุปที่ `architecture/CORE-CONTRACT-v0.1.md:19` · **ผลของ probe (ขั้น 4) และเกณฑ์ตัดสินทั้งตาราง** (เป็นการอนุมานจากกติกา PostgreSQL ไม่ใช่ผลบน hosted: การเป็นสมาชิก role ที่ SET ROLE/สืบทอดสิทธิ์ได้, `createrole_self_grant`, grant option บน `auth`, ผลของ `ALTER ... OWNER` และ seed INSERT หลังโอนเจ้าของ) · ว่า `postgres.<ref>` เป็น superuser หรือมี `BYPASSRLS`/`CREATEROLE` หรือไม่ · พฤติกรรม `psql` ที่ exit code 3 เมื่อ `ON_ERROR_STOP` ทำงาน (เป็นพฤติกรรมตามเอกสาร psql ยังไม่ได้ลองเพราะเครื่องร่างไม่มี `psql`) · ว่า dotenv รับ PEM แบบ `\n` · ว่า hosted log คำสั่ง `ALTER ROLE ... PASSWORD` หรือไม่ · **ข้อจำกัด revoke/archive:** ณ @b080d57 ยังไม่มี route หรือ UI ใดเรียก `SupabaseKnowledgeRevocation` (`platform/adapters/persistence/supabase/knowledge-revocation.ts:17` ถูกอ้างถึงเฉพาะในเทสต์/harness) จึงทดสอบ revoke และ archive ผ่านหน้าเว็บไม่ได้ ตรวจได้เพียงว่าฟังก์ชันมีอยู่ตาม SQL หลัง apply; การเรียกจริงต้องรอ route · SQL ตรวจหลัง apply (หัวข้อ 4), preflight, probe และ rollback ผ่านการ parse/รันบน PGlite 0.5.8 (PostgreSQL 18.3 ในเครื่อง, ผู้ใช้เป็น superuser, schema `auth`/`storage` เป็น stub) เท่านั้น: preflight ไม่มี STOP บนฐานว่างและ STOP หลัง apply, probe คืน 1 แถว, SQL หลัง apply ได้ 2/2/1, บล็อก rollback ปฏิเสธเมื่อไม่ ack / มี view-FK นอก `aicp` / มีตารางเกิน / schema ยังอยู่ แล้วรันครบเมื่อเงื่อนไขผ่าน; **ยังไม่เคยรันด้วย `psql` จริง ไม่เคยรันบน Supabase และสิทธิ์แบบ non-superuser ยังไม่ได้ทดสอบ** · ข้อที่เพิ่มในหัวข้อ 4 (แชตลูกค้า) ยังไม่มีโฮสต์ให้ทดสอบ · วิธี "ต่อท้าย" Data API และการ reload cache · `postgres.<ref>` มีสิทธิ์พอสำหรับ ownership/grant · DDL ผ่าน pooler โหมด 6543 · `storage.objects` ลบด้วย SQL ได้หรือไม่ · พฤติกรรม `getClaims`/`Sec-Fetch-Site` จากเบราว์เซอร์จริง · การค้นหา setting `pgrst.db_schemas` ใน preflight
