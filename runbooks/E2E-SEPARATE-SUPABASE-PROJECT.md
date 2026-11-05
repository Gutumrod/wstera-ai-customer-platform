# Runbook (DRAFT): G1 E2E บนโปรเจกต์ Supabase ทดสอบแยก

**สถานะ: DRAFT / NOT RUN / UNREVIEWED** · ระดับที่อ้างได้สูงสุด **BUILD_PASS** · ไม่มีขั้นตอนใดในไฟล์นี้เคยถูกรันกับ Supabase จริง

> **เอกสารนี้ไม่ใช่การอนุญาต** การ apply migration, seed, แก้ dashboard และรัน E2E แต่ละอย่างต้องมี Owner GO ที่ **ระบุชื่อโปรเจกต์ทดสอบ** ก่อนเสมอ GO ที่ไม่ระบุชื่อ หรือ GO ของ `wstera-lab` ใช้ไม่ได้ ห้ามรันกับโปรเจกต์ที่ใช้ร่วมกับของอื่น repo นี้เป็น public: ห้ามใส่ project ref จริง, key, URL ที่มี password, หรืออีเมลที่ไม่ใช่ `@example.test` ลงไฟล์นี้หรือ commit ใด ๆ

อ้างอิงคำตัดสิน: D-20261103-31 (เป้า E2E = โปรเจกต์ Supabase ทดสอบแยก; พบในทะเบียน `vault-rules/06-Agent-Logs/WSTERA-House/DECISIONS-REGISTER.md` สถานะ LOCKED ตรวจเมื่อ 2026-11-05 · repo นี้มีเพียงแถวสรุปที่ `architecture/CORE-CONTRACT-v0.1.md:19` ไม่มีเนื้อคำตัดสินเต็ม), D-20261025-11 (schema `aicp` เท่านั้น ห้าม `public` ห้าม Docker Desktop) · ที่มาของรายการความเสี่ยง: `plans/HANDOFF-2026-11-03.md` ข้อ 4 และ 6 บน branch `claude/project-thread-8xgsii` (draft PR #27) ซึ่งตรวจซ้ำกับโค้ดแล้วในหัวข้อ 1 (เทียบ main @1b94ce5 ตรวจเมื่อ 2026-11-05 หลัง migration ทั้ง 5 ไฟล์ถูกแก้ให้รันด้วย role ที่ไม่ใช่ superuser) · ผล probe สิทธิ์จริงของ `postgres.<ref>` บนโปรเจกต์ทดสอบ: D-20261105-03 และ D-20261105-04 (หัวข้อ 3 ขั้น 4)

## 0. ก่อนเริ่ม: เงื่อนไขที่ต้องครบ (NOT RUN)

- [ ] Owner GO เป็นลายลักษณ์อักษรที่ระบุ **ชื่อโปรเจกต์ทดสอบ** และแยก GO ตามขั้น: apply, seed, แก้ Data API, รัน E2E
- [ ] โปรเจกต์เป็นของใหม่ ใช้แล้วรื้อทิ้ง ไม่มีข้อมูลหรือผู้ใช้จริง (preflight แถว ord 60 ตรวจผู้ใช้ให้บางส่วน)
- [ ] มี host ของ **Session pooler** รูปแบบ `aws-N-<region>.pooler.supabase.com` (ตัวเลข N และ region ดูจากหน้า Connect ของโปรเจกต์) โค้ดปฏิเสธ host ตรงและ host รูปแบบอื่น (`platform/composition/knowledge-database-url.ts:12`, `scripts/seed-environment.mjs:23`)
- [ ] อีเมลเจ้าของสังเคราะห์ (`LOCAL_OWNER_EMAIL`) ต้องลงท้าย `@example.test` (`scripts/seed-environment.mjs:26`)
- [ ] เครื่องรัน: Node.js 22.13+ และ npm (`npm ci` ทำโดย operator เอง ไม่ใช่ในเอกสารนี้), ที่เก็บ secret ที่ไม่ใช่ repo
- [ ] **ผู้ปฏิบัติต้องมี `psql` ใช้งานได้** (ตรวจ `psql --version` ก่อนเริ่มทุกครั้ง; ไคลเอนต์ PostgreSQL รุ่นใดก็ได้ที่รองรับ `-X`, `-x`, `-v ON_ERROR_STOP=1`, `--single-transaction` และอ่าน `PGSSLMODE`/`PGSSLROOTCERT`) ทุกขั้นที่แตะฐานข้อมูล และเกณฑ์ผ่าน/หยุด (exit code, ข้อความ `ERROR`, `WARNING: no privileges...`, บรรทัด `PREFLIGHT_COMPLETE`) อิงพฤติกรรมของ `psql` · **เครื่องที่ร่างและทดสอบเอกสารนี้ไม่มี `psql`** (ตรวจ 2026-11-05) จึงยังไม่เคยรันคำสั่ง `psql` ในไฟล์นี้จริงเลย (ทดสอบเฉพาะเนื้อ SQL บน PGlite ดูหัวข้อ 7) · ไม่มี `psql` = **ยังเริ่มไม่ได้** ติดตั้งก่อน; จะใช้ SQL editor ของ dashboard หรือเครื่องมืออื่นแทนต้องให้ Owner ตัดสินแยก เพราะเกณฑ์หยุดทั้งหมดอิง exit code และ output ดิบของ `psql`
- [ ] ค่าทุกตัวอยู่ใน `.env.local` (ถูก ignore โดย `.gitignore` บรรทัด 10-15) ห้าม echo/print ห้ามวางในแชต ถ้าเห็นค่า key หลุดใน output ให้หยุดและแจ้ง Owner ทันที

## 1. ผลตรวจซ้ำ 5 จุดสัมผัสของ PR #27 กับโค้ดจริง

ในหัวข้อ 1 `g1` = `supabase/migrations/20261023000100_g1_workspace_host.sql`

| # | ข้ออ้างใน PR #27 | ผลตรวจ | หลักฐาน (`path:line`) |
|---|---|---|---|
| 1 | role `aicp_migrator`/`knowledge_runtime` สร้างถ้าไม่มี ชื่อซ้ำแล้ว `ALTER ROLE` ทับ | **ล้าสมัย: main @1b94ce5 เปลี่ยนแล้ว** migration ไม่ `ALTER ROLE` ทับ role ใดอีก: ถ้าไม่มีจะสร้าง (`NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`); ถ้ามีและ attribute อันตราย (`aicp_migrator`: super/bypassrls/login/createdb/createrole/replication/inherit; `knowledge_runtime`: เหมือนกันยกเว้น login) จะ `RAISE AICP_MIGRATOR_ROLE_UNSAFE` / `KNOWLEDGE_RUNTIME_ROLE_UNSAFE`; ถ้ามีและ attribute ปลอดภัยจะถูก **นำมาใช้ต่อเงียบ ๆ** (aicp_migrator ได้เป็นเจ้าของ schema/ตาราง/ฟังก์ชัน, knowledge_runtime ได้ GRANT) preflight แถว 10-12 จึงยังต้อง STOP เมื่อมี role ชื่อซ้ำ · **seed ยังเป็นจุดสัมผัสที่ 6**: สั่ง `ALTER ROLE knowledge_runtime LOGIN PASSWORD` และตรวจแค่ไม่ใช่ superuser/bypassrls ดังนั้น role ชื่อซ้ำที่ไม่ใช่ superuser จะถูกตั้ง password ทับโดยไม่ถูกเตือน | `g1:79-102`, `g1:110-121`, `scripts/seed-local.mjs:28-33` |
| 2 | bucket `knowledge-originals` private 5 MB `ON CONFLICT DO UPDATE` | **ถูกบางส่วน (เปลี่ยนตาม main @1b94ce5)** ถ้าผู้รันมี SELECT บน `storage.buckets` ใช้ `ON CONFLICT DO UPDATE` ทับ `public`, `file_size_limit`, `allowed_mime_types` (4 ชนิด) ไม่ทับ `name`; ถ้าไม่มี SELECT ใช้ INSERT ธรรมดา ซึ่งไม่ทับแต่ **ทำให้ migration ไฟล์ 2 ล้มทั้งไฟล์** เมื่อ id ซ้ำ · probe วัดได้ INSERT/UPDATE และ SELECT (รอบ 1 นับแถว `storage.buckets` สำเร็จ, D-20261105-03; รอบ 2 D-20261105-04); DELETE = UNVERIFIED | `g1:123-138` |
| 3 | FK ไป `auth.users`, `GRANT USAGE ON SCHEMA auth`, seed สร้างผู้ใช้สังเคราะห์ 1 คน | **FK และ seed ถูก ส่วน `GRANT USAGE ON SCHEMA auth` ถูกเอาออกแล้ว** FK ยังอ้าง `auth.users` (ผู้รันต้องมี REFERENCES); แทนที่ด้วยฟังก์ชันห่อ `aicp.current_auth_uid()` (SECURITY DEFINER, `search_path = pg_catalog`, เจ้าของ = ผู้รัน migration) ที่เรียก `auth.uid()` แล้วให้ `is_active_workspace_member`, approve, revoke, archive เรียกฟังก์ชันห่อนี้ (policy `workspace_memberships_self_read` ยังเรียก `auth.uid()` ตรง ๆ) · seed สร้างผ่าน Auth Admin API (`email_confirm: true`) ไม่ใช่ SQL และถ้าอีเมลซ้ำจะค้นด้วย `listUsers` หน้าแรก 1000 คนเท่านั้น (โปรเจกต์ใหญ่อาจหาไม่เจอ → `LOCAL_AUTH_USER_NOT_FOUND`) | `g1:11`, `g1:35-41`, `g1:55`, `g1:69`, `20261103000100_host_hardening.sql:59`, `20261103000200_host_hardening_revoke.sql:28`, `:77`, `scripts/seed-local.mjs:14-23` |
| 4 | Data API ต้อง expose `aicp` โดยต่อท้าย และ PostgREST reload cache | **ส่วน "ต้อง expose" ถูก** (โค้ดเรียก `.schema("aicp")` ผ่าน Data API) **ส่วน "ต่อท้ายห้ามแทนที่" และ "reload schema cache" ไม่มีใน repo = UNVERIFIED** (เป็นพฤติกรรมของ dashboard/PostgREST ที่ repo ไม่พิสูจน์) | `platform/adapters/persistence/supabase/workspace-membership-repository.ts:9`, `knowledge-approval.ts:15`, `README.md:57`, `:70` ไม่พบ `NOTIFY pgrst` ในโค้ด/migration (มีเฉพาะใน comment ของ `scripts/e2e-rollback.sql`) |
| 5 | Pooler: ใช้ connection ร่วม | **ถูก** โค้ดบังคับ pooler เท่านั้น (`aws-N-*.pooler.supabase.com`, พอร์ต 5432/6543, db `postgres`, ไม่มี query/fragment, user `knowledge_runtime.<ref>` สำหรับ runtime และ `postgres.<ref>` สำหรับ seed) ปฏิเสธ host ตรง | `platform/composition/knowledge-database-url.ts:12-16`, `scripts/seed-environment.mjs:22-25` |
| ไม่แตะ | ไม่มี `CREATE EXTENSION`, ไม่แตะ `public` | **ถูก** ตามที่อ่านทั้ง 5 ไฟล์ ไม่พบ `CREATE EXTENSION` และทุก object อยู่ใน `aicp` (ยกเว้น role, bucket และสมาชิกภาพของผู้รันบน `aicp_migrator` ที่ GRANT/REVOKE ชั่วคราว) | `supabase/migrations/*.sql` (ทั้งห้าไฟล์) |

รายการ env ของ PR #27 ข้อ 6 **ขาด**: `NEXT_PUBLIC_APP_URL` (เช็ค same-origin ถ้าไม่ตั้งทุก POST ถูก 403 `ORIGIN_DENIED`, `platform/apps/merchant-console/lib/http.ts:10-11`), `KNOWLEDGE_RUNTIME_PASSWORD` (บังคับ 64 hex, `scripts/seed-environment.mjs:39-40`; seed ตั้งเป็น password ของ role และต้องตรงกับ password ใน `DATABASE_URL`), และ `LOCAL_OWNER_PASSWORD` (ยาว >= 20, `:42-43`; HANDOFF ข้อ 6 เขียนเป็นคำพูดว่า "รหัสผ่านเจ้าของสังเคราะห์" โดยไม่มีชื่อตัวแปร จึงขาดเฉพาะชื่อ) นอกจากนี้ seed ต้องการ `APP_ENV=lab` (`:35` ยอมรับ `local` ด้วย; ด่านที่บังคับ lab คือ `:45-48` ผ่าน `assertLab`) และ `NEXT_PUBLIC_APP_ENV=lab` (`:18`)

ช่องว่างอีกข้อ: seed สร้าง workspace เดียว `synthetic-shop` กับเจ้าของหนึ่งคน (`scripts/seed-local.mjs:34-48`) จึงยังไม่มีข้อมูลสำหรับทดสอบ **cross-workspace denial** ต้องเตรียมเพิ่มตามขั้น 7 ในข้อ 3

ความเสี่ยงที่ยังไม่รู้ (**UNVERIFIED จนกว่าจะมี apply จริง**): migration ใหม่ไม่พึ่ง superuser และไม่พึ่ง `createrole_self_grant` แล้ว แต่ยังพึ่งสิ่งที่ probe วัดไม่ได้ก่อน apply หรือยังไม่ได้วัด: (ก) ผู้รันได้ **ADMIN OPTION** บน `aicp_migrator`/`knowledge_runtime` ที่ตัวเองสร้างหรือไม่ (PostgreSQL 16+ ให้อัตโนมัติ; `g1:106` และต้นไฟล์ 2-5 `GRANT aicp_migrator TO <ผู้รัน> WITH INHERIT FALSE, SET TRUE` พึ่งสิ่งนี้ และ rollback ก็พึ่ง) (ข) `can_create_in_db` (`20261022000100_knowledge.sql:1`, `g1:121`) (ค) DELETE บน `storage.buckets` และ `storage.objects` (ผลต่อ rollback; SELECT บน `storage.buckets`, `storage.objects`, `auth.users` วัดแล้วว่ามี ดูขั้น 4) (ง) `SET ROLE` ใน `--single-transaction` ผ่าน pooler session mode · seed INSERT หลังโอนเจ้าของ (`seed-local.mjs:34-48`) ทดสอบบนจำลองแล้วว่าผ่านเมื่อผู้รันมี `BYPASSRLS` กับ GRANT ที่ `g1:140-144` และล้มด้วย RLS เมื่อไม่มี `BYPASSRLS` (เกณฑ์ข้อ 8 ในขั้น 4) บน hosted ยังไม่เคยรัน · **ห้ามเดา** ให้รัน Probe แล้วเทียบเกณฑ์; ถ้าเกณฑ์เข้าข่ายล้มหรือ apply ล้มที่บรรทัดเหล่านี้ ให้หยุดตามข้อ 5 ห้ามแก้สิทธิ์เพิ่มเอง (เช่น ห้าม `GRANT aicp_migrator TO` บัญชีที่ต่อ ด้วยมือ) จนกว่า Owner จะ GO ทางแก้

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
- นำค่าเข้าตัวแปรโดยไม่พิมพ์ค่าบนบรรทัดคำสั่งและไม่ echo (ค่าไม่แสดงบนจอ ไม่เข้า history) หรือโหลดจากที่เก็บ secret นอก repo · **ห้ามพิมพ์ `$env:SUPABASE_DB_ADMIN_URL = "ค่าจริง"` หรือ `export ...=ค่าจริง` ตรง ๆ** เพราะค่าเข้าประวัติ shell
  - Git Bash: `read -rs SUPABASE_DB_ADMIN_URL; export SUPABASE_DB_ADMIN_URL` แล้ววางค่าที่ prompt · จบงาน `unset SUPABASE_DB_ADMIN_URL`
  - PowerShell (`read -rs` ไม่มีใน PowerShell): `$s = Read-Host "DB admin URL" -AsSecureString; $env:SUPABASE_DB_ADMIN_URL = [System.Net.NetworkCredential]::new('', $s).Password; Remove-Variable s` แล้วเรียก `psql $env:SUPABASE_DB_ADMIN_URL ...` แทน `"$SUPABASE_DB_ADMIN_URL"` · จบงาน `Remove-Item Env:SUPABASE_DB_ADMIN_URL` (ตัวแปรอยู่เฉพาะ process นี้ ปิดหน้าต่างก็หาย) · ค่าจะอยู่ในหน่วยความจำและ environment ของ process ลูกที่ `psql` เห็น
  - **วิธีทั้งสองยังไม่ได้ทดสอบกับ `psql` จริง** (เครื่องร่างไม่มี `psql`); คำสั่งตัวอย่างอื่นในไฟล์นี้เขียนด้วยไวยากรณ์ Git Bash (`"$VAR"`) ผู้รันบน PowerShell ต้องแปลงเอง · ห้ามรัน `env`, `set`, `printenv` หรือ `echo "$SUPABASE_DB_ADMIN_URL"` ใน session นี้
- ตรวจ TLS เต็มรูปแบบ: ตั้ง `PGSSLMODE=verify-full` และ `PGSSLROOTCERT=<path ไฟล์ CA นอก repo>` ก่อนรัน `psql` ใด ๆ (libpq อ่านสองตัวแปรนี้เอง; `sslmode=verify-full` ใน URL ทำไม่ได้เพราะโค้ดปฏิเสธ URL ที่มี query) ไฟล์ CA คือไฟล์ที่ดาวน์โหลดจาก dashboard ในขั้น 2 (เก็บไว้นอก repo; เนื้อเดียวกับที่ใส่ใน `SUPABASE_DB_CA_CERT`) ถ้า `psql` รายงานว่า verify ล้ม (certificate / hostname) = **STOP** ห้ามลด `sslmode` ลง
- ผลที่ถือว่ายังไม่ปลอดภัยที่จะ apply: `psql` exit code ไม่ใช่ 0, มีข้อความ `ERROR`, หรือมี `WARNING: no privileges were granted` / `no privileges could be revoked` (GRANT/REVOKE ที่ไม่ได้ผลจะเป็นแค่ WARNING และ `ON_ERROR_STOP` ไม่หยุดให้) → STOP
- หลักฐานบันทึกคำสั่งในรูปที่ใช้ชื่อตัวแปร (`psql "$SUPABASE_DB_ADMIN_URL" -X ...`) เท่านั้น
- ทุกคำสั่งใช้ `-X` (ไม่อ่าน `.psqlrc`); คำสั่งที่เขียนใช้ `-v ON_ERROR_STOP=1`

1. **ตรวจผูกชื่อ** Owner ยืนยันชื่อโปรเจกต์ + ref ตรงกับ GO ที่ได้รับ [NOT RUN]
2. **Owner dashboard ล่วงหน้า (ดาวน์โหลด CA cert):** Project Settings > Database > SSL certificate > ดาวน์โหลด CA ใส่ใน `SUPABASE_DB_CA_CERT` และเก็บไฟล์ CA เดียวกันนอก repo สำหรับ `PGSSLROOTCERT` [NOT RUN]
3. **Preflight (อ่านอย่างเดียว):** `psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 -f scripts/e2e-preflight.sql` เก็บ output ดิบ · **ผ่านก็ต่อเมื่อครบทุกข้อ:** exit code 0, ไม่มีข้อความ `ERROR`, มีแถว `VERDICT` สถานะ `OK`, ไม่มีแถว `STOP`, และบรรทัดสุดท้ายคือ `PREFLIGHT_COMPLETE` · **อย่างอื่นทั้งหมดคือ STOP** รวมถึง: คำสั่งล้ม/exit code ไม่ใช่ 0, ผลว่าง 0 แถว, ไม่มีแถว `VERDICT`, ไม่มี `PREFLIGHT_COMPLETE` (การตรวจไม่จบ = ไม่ได้ตรวจ ไม่ใช่ "ไม่พบปัญหา") · แถว `identity:` 3 แถว (database, user, server version) ต้องเทียบกับ GO/หน้า Connect ของโปรเจกต์ที่ระบุ ถ้าไม่ตรง STOP (ดูข้อ 5) [NOT RUN]
4. **Probe สิทธิ์ของผู้เชื่อมต่อ (อ่านอย่างเดียว) ก่อน Apply:** ตอบว่า `postgres.<ref>` บน hosted ผ่านบรรทัดสิทธิ์ที่ migration ใหม่พึ่ง (`g1` = `supabase/migrations/20261023000100_g1_workspace_host.sql`: `g1:35-41`, `g1:79-121`, `g1:123-144`) และ seed INSERT ที่ `scripts/seed-local.mjs:34-48` ได้หรือไม่ **ห้ามเดา** · รัน SQL เดียวนี้ (ไม่แก้อะไร; คอลัมน์ `auth_usage` ถึง `objects_delete` เพิ่มจากรอบที่ Owner รัน เพื่อให้ตรงกับเกณฑ์ด้านล่าง; `can_create_in_db`, `buckets_select` และคอลัมน์หลังจากนั้นไม่อยู่ในผลที่รายงาน):
   ```
   psql "$SUPABASE_DB_ADMIN_URL" -X -x -v ON_ERROR_STOP=1 <<'SQL'
   SELECT current_setting('server_version') AS server_version,
          current_setting('server_version_num')::int AS server_version_num,
          current_database() AS db,
          r.rolname AS connected_user,
          r.rolsuper, r.rolcreaterole, r.rolbypassrls, r.rolinherit,
          has_database_privilege(r.oid, current_database(), 'CREATE') AS can_create_in_db,
          current_setting('createrole_self_grant', true) AS createrole_self_grant,
          (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'auth') AS auth_schema_owner,
          has_schema_privilege(r.oid, 'auth', 'USAGE') AS auth_usage,
          has_schema_privilege(r.oid, 'auth', 'USAGE WITH GRANT OPTION') AS auth_usage_grantable,
          has_table_privilege(r.oid, 'auth.users', 'REFERENCES') AS auth_users_references,
          has_table_privilege(r.oid, 'auth.users', 'SELECT') AS auth_users_select,
          has_function_privilege(r.oid, 'auth.uid()', 'EXECUTE') AS auth_uid_execute,
          has_schema_privilege(r.oid, 'storage', 'USAGE') AS storage_usage,
          has_table_privilege(r.oid, 'storage.buckets', 'INSERT') AS buckets_insert,
          has_table_privilege(r.oid, 'storage.buckets', 'UPDATE') AS buckets_update,
          has_table_privilege(r.oid, 'storage.buckets', 'SELECT') AS buckets_select,
          has_table_privilege(r.oid, 'storage.buckets', 'DELETE') AS buckets_delete,
          has_table_privilege(r.oid, 'storage.objects', 'SELECT') AS objects_select,
          has_table_privilege(r.oid, 'storage.objects', 'DELETE') AS objects_delete,
          (SELECT string_agg(g.rolname || ' ' || (to_jsonb(m) - 'oid' - 'roleid' - 'member' - 'grantor')::text, '; ' ORDER BY g.rolname)
             FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid WHERE m.member = r.oid) AS member_of
   FROM pg_roles r WHERE r.rolname = current_user;
   SQL
   ```
   ได้ 1 แถว (0 แถว หรือ error = STOP; `has_*_privilege` จะ error ถ้าไม่มี object นั้น เช่น ไม่มี `auth.uid()` ซึ่งก็คือ STOP) · `createrole_self_grant` เป็น NULL บน PostgreSQL ก่อน 16 · `member_of` แสดงเฉพาะ role ที่บัญชีนี้เป็นสมาชิกอยู่ **ก่อน** apply (`aicp_migrator` ยังไม่มีจึงไม่อยู่ในรายการ; ในรุ่น 16+ แสดงค่า admin/inherit/set ของแต่ละสมาชิกภาพ)

   **ผล probe ที่เกิดจริงบนโปรเจกต์ทดสอบ** (อ่านอย่างเดียว; อ้าง D-20261105-03 และ D-20261105-04; ค่ามาจากรายงานของผู้สั่งงาน ไม่มี output ดิบใน repo; ไม่ใส่ project ref):

   | ค่า | ผลจริง | รอบ |
   |---|---|---|
   | `server_version` | 17.11 | D-20261105-03 |
   | `rolsuper` / `rolcreaterole` / `rolbypassrls` | false / true / true | D-20261105-03 |
   | `createrole_self_grant` | ว่าง | D-20261105-03 |
   | USAGE บน schema `auth` | มี **ไม่มี grant option** | D-20261105-03 |
   | REFERENCES บน `auth.users` | มี | D-20261105-04 |
   | EXECUTE บน `auth.uid()` | มี | ผู้สั่งงานรายงานรวม ไม่ได้ระบุรอบ |
   | USAGE บน schema `storage` | มี | D-20261105-04 |
   | INSERT / UPDATE บน `storage.buckets` | มี / มี | D-20261105-04 |
   | SELECT บน `auth.users` (`auth_users_select`) | true (รอบ 1 นับแถวสำเร็จ) | D-20261105-03, D-20261105-04 |
   | SELECT บน `storage.buckets` | มี (รอบ 1 นับแถวสำเร็จ) | D-20261105-03 |
   | SELECT บน `storage.objects` (`storage_objects_select`) | true | D-20261105-04 |
   | `can_create_in_db`, ADMIN OPTION บน role ที่สร้างเอง, DELETE บน `storage.buckets` และ `storage.objects` | **UNVERIFIED** (ไม่อยู่ในผลที่รายงาน; ADMIN OPTION วัดก่อน apply ไม่ได้ เพราะ role ยังไม่มี) | - |

   **เกณฑ์ตัดสิน** (อนุมานจากกติกาของ PostgreSQL แล้ว **ทดสอบการล้มจริงบน PGlite** ด้วยการถอนสิทธิ์ทีละข้อ ไม่ใช่การลองบน hosted = ส่วนที่เป็นของ hosted ยัง **UNVERIFIED**; ถ้าข้อใดเข้าข่าย ให้ **STOP รายงาน Owner พร้อมผลดิบ ห้าม apply**; แถวที่ 2-8 ใช้เมื่อ `rolsuper` = false; `host_hardening` = `20261103000100_host_hardening.sql`, `revoke` = `20261103000200_host_hardening_revoke.sql`, `visibility` = `20261104000100_knowledge_visibility.sql`):

   | ผล probe | คำสั่งที่ล้ม / ผลที่ตามมา | บรรทัดอ้างอิง | ผลจริงเทียบเกณฑ์ |
   |---|---|---|---|
   | `server_version_num` < 160000 | ทุกไฟล์ที่มี `GRANT aicp_migrator TO ... WITH INHERIT FALSE, SET TRUE` (ไวยากรณ์ PG16+) ล้ม syntax error | `g1:106`, `host_hardening:16`, `revoke:16`, `visibility:23` | ผ่าน (17.11) |
   | `rolcreaterole` = false | `CREATE ROLE` ใน DO block: `permission denied to create role` | `g1:85`, `g1:97` (DO ที่ `g1:79-102`) | ผ่าน (true) |
   | `can_create_in_db` = false | `CREATE SCHEMA IF NOT EXISTS aicp` ล้มตั้งแต่ไฟล์แรก (`permission denied for database`) และ `ALTER SCHEMA aicp OWNER TO` ต้องการสิทธิ์เดียวกันตามกติกา PostgreSQL (ข้อนี้อนุมาน ไม่ได้แยกทดสอบ) | `20261022000100_knowledge.sql:1`, `g1:121` | **UNVERIFIED** |
   | `auth_users_references` = false | `CREATE TABLE aicp.workspace_memberships` ล้ม `permission denied for table users` | `g1:9-16` (FK ที่ `:11`) | ผ่าน (true) |
   | `auth_usage` = false | ตารางเดียวกันล้ม `permission denied for schema auth` | `g1:9-16` | ผ่าน (true) |
   | `auth_uid_execute` = false | **apply ผ่านเงียบ ๆ แต่ทุกการเรียก `aicp.current_auth_uid()` ล้มตอนรัน** `permission denied for function uid` (policy ของ `authenticated`, approve/revoke/archive) จึงเป็น STOP ตั้งแต่ probe | `g1:37-40`, `g1:55` | ผ่าน (true) |
   | `storage_usage` = false, หรือ `buckets_insert` = false, หรือ (`buckets_select` = true และ `buckets_update` = false) | บล็อก bucket ล้ม (`permission denied for schema storage` / `for table buckets`); `ON CONFLICT DO UPDATE` ต้องมี UPDATE ทุกครั้งที่มี SELECT | `g1:126-138` | ผ่าน (true / true / UPDATE = true); `buckets_select` = มี (วัดแล้ว) |
   | `rolbypassrls` = false | migration ผ่าน แต่ **seed INSERT ล้ม** `new row violates row-level security policy`: ตาราง workspace เป็นของ `aicp_migrator` RLS เปิดอยู่ มี policy อ่านอย่างเดียวให้ `authenticated`; GRANT ที่ migration ให้ผู้รัน (`g1:140-144`) ให้สิทธิ์ตาราง แต่ไม่ให้ข้าม RLS | `scripts/seed-local.mjs:34-48` | ผ่าน (true) |
   | `rolsuper` = true | ไม่เข้าเกณฑ์ข้างบนข้อใด (superuser ข้ามทุกด่านนี้) แต่บน hosted ที่ได้ superuser ถือว่าผิดคาด → รายงานผลดิบให้ Owner ดูก่อน | - | ผ่าน (false) |

   **เกณฑ์ที่เลิกใช้แล้ว** (เทียบกับร่างก่อน main @1b94ce5): `createrole_self_grant` ไม่มี `set`/`inherit` และ `auth_usage_grantable` = false เคยทำให้ล้ม แต่ migration ใหม่ขอ SET เองด้วย `GRANT ... WITH INHERIT FALSE, SET TRUE` ผ่าน ADMIN OPTION และไม่ GRANT อะไรบน schema `auth` ให้ใครแล้ว (ทดสอบบน PGlite ว่าผ่านเมื่อ `createrole_self_grant` ว่างและ USAGE บน `auth` ไม่มี grant option) · ค่าสองตัวนี้ยังอยู่ใน SQL ข้างบนเป็นข้อมูล ไม่ใช่เกณฑ์

   ผลอื่นที่ไม่เข้าเกณฑ์ใดเลย **ไม่ใช่การรับรองว่า apply จะผ่าน** แค่ว่ายังไม่พบเหตุให้หยุดจาก probe นี้ (ผลจริงมาจาก apply เท่านั้น) · **ผลที่รายงานมาจนถึงตอนนี้ไม่เข้าเกณฑ์ล้มข้อใดที่วัดได้ ส่วนที่ยัง UNVERIFIED คือ `can_create_in_db`, ADMIN OPTION และ DELETE บน storage** · ห้ามแก้เกณฑ์ที่ล้มด้วยมือ (เช่น `GRANT aicp_migrator TO ...`, `ALTER ROLE ... CREATEROLE`) หรือแก้ migration/seed เอง ต้องให้ Owner ตัดสินทางแก้เป็น GO แยก [NOT RUN]
5. **Apply** 5 ไฟล์ตามลำดับ (ลำดับชื่อไฟล์ = ลำดับ apply) ใช้พอร์ต 5432 (session mode) ถ้าเป็นไปได้ · ทำเมื่อ preflight ผ่านและ probe ไม่เข้าเกณฑ์ล้มเท่านั้น [NOT RUN; UNVERIFIED ว่า transaction mode 6543 ใช้กับ DDL ได้]
   ```
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261022000100_knowledge.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261023000100_g1_workspace_host.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 -f scripts/check-web-connection-duplicates.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261103000100_host_hardening.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261103000200_host_hardening_revoke.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261104000100_knowledge_visibility.sql
   ```
   คำสั่งที่สามคือ pre-check ก่อน migration ที่สามตามที่ `README.md` กำหนด (ต้องได้ 0 แถว; บนโปรเจกต์ใหม่ตารางว่างจึงควรว่างเสมอ ถ้ามีแถว STOP) · ตรวจ output ของทุกคำสั่งตามกติกา `WARNING: no privileges...` ด้านบน · ถ้าไฟล์ใดล้ม หยุด เก็บ error ดิบ ห้ามรันซ้ำจนกว่าจะเข้าใจสาเหตุ (ไม่มี down migration; ดู `scripts/e2e-rollback.sql`) · ไฟล์ 2-5 ขอสิทธิ์ `SET` บน `aicp_migrator` ชั่วคราวผ่าน ADMIN OPTION ของผู้รัน (`GRANT aicp_migrator TO <ผู้รัน> WITH INHERIT FALSE, SET TRUE`) ใช้ `SET ROLE` สร้าง object แล้ว `RESET ROLE` กับ `REVOKE SET OPTION` ท้ายไฟล์ · เพราะใช้ `--single-transaction` ไฟล์ที่ล้มจะถอยทั้งไฟล์รวมการ GRANT ชั่วคราว (ไม่ควรเหลือ SET ค้าง; ตรวจด้วย SQL ด้านล่าง) · apply ครบแล้วให้รัน SQL ตรวจหลัง apply ในหัวข้อ 4 ก่อน seed
6. **Owner dashboard: expose schema `aicp`** Project Settings > API (Data API) > Exposed schemas: **เพิ่ม** `aicp` ต่อท้ายรายการเดิม ห้ามแทนที่รายการ แล้วบันทึก; ตรวจว่า schema cache รีเฟรชแล้ว (วิธีที่แน่ชัด UNVERIFIED) [NOT RUN]
7. **Seed:** ตั้ง env ตามข้อ 2 แล้ว `npm run seed:local` สำเร็จควรพิมพ์ `Seeded one lab synthetic owner, workspace, and web connection.` seed สั่ง `ALTER ROLE knowledge_runtime LOGIN PASSWORD` (ปลอดภัยเฉพาะเมื่อ preflight ผ่าน) และสร้าง workspace `synthetic-shop` [NOT RUN]
   - **ล้มกลางทางได้:** `ALTER ROLE ... LOGIN PASSWORD` (`seed-local.mjs:32-33`) รันก่อน INSERT (`:34-48`) ถ้า INSERT ล้ม (เช่น `rolbypassrls` = false ตามเกณฑ์ข้อ 8 ในขั้น 4: ตารางเป็นของ `aicp_migrator` และ RLS เปิดอยู่) role จะเป็น LOGIN พร้อม password แล้วแต่ไม่มีข้อมูล = สภาพครึ่งทาง ให้ STOP รายงาน Owner เก็บ error ดิบ ห้ามรัน seed ซ้ำ
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
- [ ] **Approve:** เจ้าของกดอนุมัติ ผ่าน RPC `aicp.approve_knowledge_version` (`supabase/migrations/20261103000100_host_hardening.sql:52-105`; `:106-107` คือ REVOKE/GRANT; เจ้าของฟังก์ชันเป็น `aicp_migrator` เพราะสร้างภายใต้ `SET ROLE` ที่ `:19` ไม่มีคำสั่ง OWNER แยกแล้ว; ผู้อนุมัติอ่านจาก `aicp.current_auth_uid()` ที่ `:59`) สถานะ `approved`, `approved_by` = uid ของเจ้าของ (ยังไม่เคยรัน `auth.uid()` ผ่านฟังก์ชันห่อ SECURITY DEFINER ของผู้รัน กับ PostgREST จริง)
- [ ] **Search + citation:** ค้นแล้วได้คำตอบแบบ extractive พร้อม citation ชี้ source/version/locator; เวอร์ชันที่ยังไม่อนุมัติต้องไม่ถูกคืน (กรณี revoke ทดสอบผ่านหน้าเว็บไม่ได้ ดูหัวข้อ 7)
- [ ] **Cross-workspace denial:** (ก) ผู้ใช้คนที่สองที่ไม่มี membership: login ได้แต่ต้องไม่ได้ workspace ใด และ upload/approve/search ถูกปฏิเสธ (`MEMBERSHIP_REQUIRED`); (ข) ข้อมูลของ workspace อื่น (ถ้าเตรียมไว้) ต้องไม่ปรากฏในผลค้นของ `synthetic-shop`; (ค) POST ที่ไม่มี/ผิด `Origin` ต้อง 403
- [ ] **Negative:** staff (ไม่ใช่ owner) อนุมัติไม่ได้ (`OWNER_ROLE_REQUIRED`) *(ต้องมีผู้ใช้ staff เพิ่ม ซึ่ง seed ไม่ได้สร้าง; ถ้าไม่เตรียม ให้บันทึกว่า "ไม่ได้ทดสอบ")*

- [ ] **แชตลูกค้า (ทำได้เมื่อโฮสต์จริงของแชต merge แล้ว):** หน้าแชตตอบจากเอกสารที่ visibility = `customer` พร้อม citation และไม่ตอบจากเอกสาร visibility = `internal` (ต้องเตรียมเอกสารสังเคราะห์ทั้งสองชนิดและอนุมัติทั้งคู่) *(ตรวจซ้ำ 2026-11-05 ที่ main @1b94ce5: มี route แชต `platform/composition/web-chat-routes.ts` แต่ยังไม่มีหน้าเว็บของ merchant-console; ข้อนี้ยังทำไม่ได้)*

### SQL ตรวจหลัง apply (อ่านอย่างเดียว ยังไม่เคยรันบน hosted)

รันด้วย `psql "$SUPABASE_DB_ADMIN_URL" -X -x -v ON_ERROR_STOP=1` (`-x` = หนึ่งคอลัมน์ต่อบรรทัด; วาง SQL ด้านล่างทาง stdin) หลัง apply ครบ 5 ไฟล์ แต่ละคอลัมน์ต้องเท่าค่าที่ชื่อบอก (`..._expect_2`, `..._expect_aicp_migrator`, `..._expect_true`, `..._expect_false`, `..._expect_0`) และ `all_as_expected_expect_true` ต้องเป็น `t` · ค่าอื่นให้หยุดตามหัวข้อ 5 เก็บ output ดิบ · `..._info_...` เป็นข้อมูลอย่างเดียว ไม่มีค่าคาด: `current_auth_uid_owner_info` ควรเท่ากับ `identity: current_user` ของ preflight (เจ้าของ `aicp.current_auth_uid()` คือผู้รัน migration ไม่ใช่ `aicp_migrator` ตั้งใจให้เป็นอย่างนั้นเพื่อให้เรียก `auth.uid()` ได้โดยไม่ต้อง GRANT บน schema `auth`), `connected_user_admin_option_info_unverified_on_hosted` ควรเป็น `t` (ถ้าเป็น `f` หรือว่าง ให้รายงาน Owner: ใช้ rollback ส่วน 3-4 ไม่ได้ตามที่เขียน) · ถ้าเชื่อมต่อเป็น superuser `connected_user_can_set_aicp_migrator_expect_false` จะเป็น `t` เสมอ ซึ่งผิดคาดสำหรับ hosted (probe ว่า `rolsuper` = false) · คอลัมน์ `connected_user_set_grants_on_aicp_migrator_expect_0` ยืนยันว่า migration ถอน SET ครบทุกแถวสมาชิกภาพ ไม่ใช่แค่ผลรวม

```sql
SELECT x.*,
  (x.revoke_archive_functions_expect_2 = 2 AND x.triggers_expect_2 = 2 AND x.visibility_column_expect_1 = 1
   AND x.aicp_functions_expect_10 = 10
   AND x.schema_owner_expect_aicp_migrator = 'aicp_migrator'
   AND x.relation_owners_expect_aicp_migrator = 'aicp_migrator'
   AND x.function_owners_except_current_auth_uid_expect_aicp_migrator = 'aicp_migrator'
   AND x.current_auth_uid_owned_by_connected_user_expect_true
   AND NOT x.connected_user_can_set_aicp_migrator_expect_false
   AND NOT x.connected_user_inherits_aicp_migrator_expect_false
   AND x.connected_user_set_grants_on_aicp_migrator_expect_0 = 0
   AND x.aicp_migrator_attributes_safe_expect_true
   AND x.connected_user_seed_privileges_expect_true
   AND NOT x.connected_user_can_write_knowledge_expect_false
   AND NOT x.app_roles_can_write_workspace_tables_expect_false) IS TRUE AS all_as_expected_expect_true
FROM (
  SELECT
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'aicp' AND p.proname IN ('revoke_knowledge_version', 'archive_knowledge_source')) AS revoke_archive_functions_expect_2,
    (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'aicp' AND NOT t.tgisinternal
        AND t.tgname IN ('knowledge_source_identity_guard', 'knowledge_version_visibility_guard')) AS triggers_expect_2,
    (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'aicp' AND c.relname = 'knowledge_versions' AND a.attname = 'visibility'
        AND a.attnum > 0 AND NOT a.attisdropped) AS visibility_column_expect_1,
    (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'aicp'::regnamespace) AS aicp_functions_expect_10,
    (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'aicp') AS schema_owner_expect_aicp_migrator,
    (SELECT string_agg(DISTINCT pg_get_userbyid(c.relowner), ',') FROM pg_class c
      WHERE c.relnamespace = 'aicp'::regnamespace AND c.relkind IN ('r', 'p', 'i', 'S')) AS relation_owners_expect_aicp_migrator,
    (SELECT string_agg(DISTINCT pg_get_userbyid(p.proowner), ',') FROM pg_proc p
      WHERE p.pronamespace = 'aicp'::regnamespace AND p.proname <> 'current_auth_uid') AS function_owners_except_current_auth_uid_expect_aicp_migrator,
    (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p
      WHERE p.pronamespace = 'aicp'::regnamespace AND p.proname = 'current_auth_uid') AS current_auth_uid_owner_info,
    (SELECT p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) FROM pg_proc p
      WHERE p.pronamespace = 'aicp'::regnamespace AND p.proname = 'current_auth_uid') AS current_auth_uid_owned_by_connected_user_expect_true,
    pg_has_role(current_user, 'aicp_migrator', 'SET') AS connected_user_can_set_aicp_migrator_expect_false,
    pg_has_role(current_user, 'aicp_migrator', 'USAGE') AS connected_user_inherits_aicp_migrator_expect_false,
    (SELECT count(*) FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid JOIN pg_roles s ON s.oid = m.member
      WHERE g.rolname = 'aicp_migrator' AND s.rolname = current_user AND m.set_option) AS connected_user_set_grants_on_aicp_migrator_expect_0,
    (SELECT bool_or(m.admin_option) FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid JOIN pg_roles s ON s.oid = m.member
      WHERE g.rolname = 'aicp_migrator' AND s.rolname = current_user) AS connected_user_admin_option_info_unverified_on_hosted,
    (SELECT NOT (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit)
      FROM pg_roles WHERE rolname = 'aicp_migrator') AS aicp_migrator_attributes_safe_expect_true,
    (SELECT bool_and(has_table_privilege(current_user, t, 'SELECT') AND has_table_privilege(current_user, t, 'INSERT')
                     AND has_table_privilege(current_user, t, 'UPDATE'))
      FROM unnest(ARRAY['aicp.workspaces', 'aicp.workspace_memberships', 'aicp.workspace_connections']) AS t) AS connected_user_seed_privileges_expect_true,
    has_table_privilege(current_user, 'aicp.knowledge_sources', 'INSERT') AS connected_user_can_write_knowledge_expect_false,
    (SELECT bool_or(has_table_privilege(r, t, 'INSERT,UPDATE,DELETE'))
      FROM unnest(ARRAY['knowledge_runtime', 'authenticated']) AS r,
           unnest(ARRAY['aicp.workspaces', 'aicp.workspace_memberships', 'aicp.workspace_connections']) AS t) AS app_roles_can_write_workspace_tables_expect_false
) AS x;
```

## 5. เงื่อนไขหยุด (STOP)

หยุดทันที เก็บ output ดิบ แจ้ง Owner ห้ามลองซ้ำ/แก้เอง เมื่อ:

- preflight มีแถว `STOP` ใด ๆ (ชื่อ role/bucket/schema/function/trigger/คอลัมน์ชน, มีผู้ใช้จริง, ไม่มี role `authenticated`) · **แถว 60 (`auth.users present`) ที่รายละเอียดว่า not readable (ค่า -1 ภายใน) ก็เป็น STOP:** ผล probe วัดแล้วว่าผู้รันมี SELECT บน `auth.users` (`auth_users_select` = true) ค่า -1 จึงขัดกับที่วัดได้ แปลว่าเชื่อมต่อด้วย role/โปรเจกต์ผิดตัว หรือ probe/preflight คนละฐาน → หยุดตรวจว่าต่อโปรเจกต์ไหนด้วย role ใด ห้ามตีความว่า "ไม่ใช่โปรเจกต์ใหม่" และห้ามปล่อยผ่าน
- preflight หรือ probe **ไม่จบ**: `psql` exit code ไม่ใช่ 0, มี `ERROR`, ผลว่าง, ไม่มีแถว `VERDICT`, ไม่มีบรรทัด `PREFLIGHT_COMPLETE` (ห้ามตีความว่า "ไม่มี STOP = ผ่าน")
- แถว `identity:` ของ preflight / ผล probe (database, user, server version) ไม่ตรงกับโปรเจกต์ใน GO
- ผล probe เข้าเกณฑ์ล้มข้อใดในขั้น 4 (ห้ามลอง apply เพื่อดูว่าล้มจริงไหม)
- `psql` แจ้ง TLS verify ล้ม หรือ output มี `WARNING: no privileges were granted` / `no privileges could be revoked`
- migration ล้ม (โดยเฉพาะที่ `CREATE SCHEMA`/`ALTER SCHEMA ... OWNER`, `GRANT aicp_migrator TO ...`, `RAISE AICP_MIGRATOR_ROLE_UNSAFE`/`KNOWLEDGE_RUNTIME_ROLE_UNSAFE`, `storage.buckets`) หรือ SQL ตรวจหลัง apply มีค่าใดไม่ตรงที่คาด (รวมถึงผู้รันยังมีสิทธิ์ SET บน `aicp_migrator`)
- ref/URL/ชื่อโปรเจกต์ที่เห็นไม่ตรงกับชื่อใน GO
- โค้ดหรือสคริปต์ throw `LAB_*_REQUIRED`/`*_MISMATCH` (อย่าแก้ guard ให้ผ่าน)
- ค่า secret ปรากฏใน terminal/log/แชต
- ต้องแตะ `wstera-lab`, schema `public`, Docker Desktop, หรือโปรเจกต์ที่ไม่ใช่ของทดสอบ

## 6. หลักฐานที่ต้องเก็บ (ตัด secret ก่อนบันทึก)

คำสั่งที่รันจริงแต่ละบรรทัดในรูปที่ใช้ **ชื่อตัวแปร** (เช่น `psql "$SUPABASE_DB_ADMIN_URL" -X ...`; ห้ามมีค่า URL/password และห้ามคัดลอกค่าจาก `env`), ค่า `PGSSLMODE` ที่ใช้ (ต้องเป็น `verify-full`) และชื่อไฟล์ CA (ไม่ใส่เนื้อไฟล์), output ดิบของ preflight (รวมแถว `identity:`) ก่อน apply, output ดิบของ probe, preflight/SQL ตรวจหลัง apply, output ดิบของ psql แต่ละไฟล์ migration, output seed, log terminal ของ `dev:console`, บันทึกแต่ละข้อของเช็กลิสต์ (ผ่าน/ล้ม + ภาพหรือ response ตัด token), commit SHA ของ repo ที่รัน, เวลา, ชื่อผู้รัน, ชื่อโปรเจกต์ (ไม่ใส่ ref ใน repo; เก็บใน vault) · ถ้าทุกข้อผ่าน ระดับที่อ้างได้สูงสุดคือ "รันครั้งเดียวบนโปรเจกต์ทดสอบ" **ไม่ใช่** LIVE_PROVEN หรือ PRODUCTION_READY และ G1 acceptance ยังต้องมีการตรวจอิสระแยกต่างหาก

## 7. UNVERIFIED ของไฟล์นี้

คำตัดสิน D-20261103-31 พบในทะเบียน vault แล้ว (LOCKED) repo มีเพียงแถวสรุปที่ `architecture/CORE-CONTRACT-v0.1.md:19` · D-20261105-03 และ D-20261105-04 เป็น GO ให้ probe อ่านอย่างเดียว (ACTIVE ในทะเบียนเดียวกัน) · **ค่าผล probe ที่ลงในหัวข้อ 3 ขั้น 4 มาจากรายงานของผู้สั่งงาน ไม่มี output ดิบแนบใน repo** (repo เป็น public ห้ามมี project ref; output ดิบอยู่ใน vault ถ้ามี)

**ที่ยังเป็น UNVERIFIED:**

- ผลของ probe ส่วนที่ **ไม่ได้อยู่ในผลที่รายงาน**: `can_create_in_db`, DELETE บน `storage.buckets` และ `storage.objects` (ผลต่อ rollback ส่วน 1-2) · SELECT บน `storage.buckets`, `storage.objects`, `auth.users` **วัดแล้ว ไม่ใช่ UNVERIFIED** (D-20261105-03/04) · ส่วน `can_create_in_db` ผลต่อ `CREATE SCHEMA` ที่ `20261022000100_knowledge.sql:1` และ `ALTER SCHEMA ... OWNER` ที่ `g1:121`
- ว่าผู้รันได้ **ADMIN OPTION** บน role ที่ตัวเองสร้าง (`aicp_migrator`, `knowledge_runtime`) บน hosted จริงหรือไม่ (PostgreSQL 16+ ให้อัตโนมัติ; migration ไฟล์ 2-5 และ rollback ส่วน 3-4 พึ่งสิ่งนี้ ดูค่าได้จาก SQL ตรวจหลัง apply คอลัมน์ `..._admin_option_info_...`) · server จริงเป็น 17.11 ส่วนที่ทดสอบเป็น PostgreSQL 18.3 พฤติกรรม role/GRANT ที่พึ่งอยู่ในเครื่องมือชุด 16+ ซึ่งสองรุ่นนี้ร่วมกัน แต่ยังไม่เคยลองบน 17.11
- พฤติกรรมของ `SET ROLE` / `RESET ROLE` ใน `--single-transaction` ผ่าน pooler โหมด session (5432) และ DDL ผ่านโหมด 6543
- พฤติกรรม `psql` ที่ exit code 3 เมื่อ `ON_ERROR_STOP` ทำงาน (ตามเอกสาร psql ยังไม่ได้ลอง **เพราะเครื่องร่างไม่มี `psql`**) และว่าคำสั่ง `\set`/`\echo` ใน preflight ทำงานตามที่เขียน
- ว่า dotenv รับ PEM แบบ `\n` · ว่า hosted log คำสั่ง `ALTER ROLE ... PASSWORD` หรือไม่ · `storage.objects`/`storage.buckets` ลบด้วย SQL ได้หรือไม่ (DELETE ยังไม่วัด) · วิธี "ต่อท้าย" Data API และการ reload cache · พฤติกรรม `getClaims`/`Sec-Fetch-Site` จากเบราว์เซอร์จริง · การค้นหา setting `pgrst.db_schemas` ใน preflight
- **ข้อจำกัด revoke/archive:** ณ @1b94ce5 ยังไม่มี route หรือ UI ใดเรียก `SupabaseKnowledgeRevocation` (`platform/adapters/persistence/supabase/knowledge-revocation.ts:17` ถูกอ้างถึงเฉพาะในเทสต์ `host-hardening-revoke.test.ts`) จึงทดสอบ revoke และ archive ผ่านหน้าเว็บไม่ได้ ตรวจได้เพียงว่าฟังก์ชันมีอยู่ตาม SQL หลัง apply · ข้อแชตลูกค้าในหัวข้อ 4 ยังไม่มีโฮสต์ให้ทดสอบ

**สิ่งที่ทดสอบแล้ว (เฉพาะบนจำลองในเครื่อง ไม่ใช่ Supabase):** PGlite 0.5.8 = PostgreSQL 18.3, ผู้รันจำลองเป็น role ที่ไม่ใช่ superuser (`CREATEROLE BYPASSRLS`, `createrole_self_grant` ว่าง, USAGE บน `auth` โดยไม่มี grant option, REFERENCES บน `auth.users`, EXECUTE บน `auth.uid()`, USAGE บน `storage`, INSERT/UPDATE บน `storage.buckets`) แบบเดียวกับ `platform/adapters/persistence/supabase/hosted-role-compat.test.ts` โดย `auth`/`storage` เป็น stub · ผล 2026-11-05: preflight บนฐานว่างได้ `VERDICT OK` ไม่มี STOP; apply 5 ไฟล์ผ่านโดยไม่มี `no privileges were granted`; SQL ตรวจหลัง apply ได้ `all_as_expected_expect_true` = t; preflight หลัง apply ได้ STOP ตามคาด; seed ผ่าน; rollback ส่วน 1-5 ผ่านครบ (ผู้รันมีสิทธิ์ SELECT/DELETE บน storage และ `auth.users` ในจำลองนี้; บน hosted วัด DELETE ไม่ได้) แล้ว preflight ได้ `VERDICT OK`; guard ของ rollback ปฏิเสธเมื่อไม่ ack / ส่วน 4 ก่อนส่วน 3 / มีฟังก์ชันเกินใน `aicp` / มี view นอก `aicp` อ้าง `aicp` · เมื่อถอนสิทธิ์ทีละข้อจากจำลอง ผลล้มตรงกับตารางเกณฑ์ในขั้น 4 · (บน hosted วัดแล้วว่ามี SELECT จึงไม่เข้ากรณีนี้ ส่วนนี้เป็นผลจำลองเท่านั้น) ถ้าผู้รันไม่มี SELECT บน `storage.buckets`/`storage.objects`: preflight ยังจบได้ (แถว 30 เป็น INFO), ส่วน 0b และส่วน 1 ของ rollback ล้ม `permission denied` ตามที่เขียนไว้ (ต้องล้างผ่าน dashboard) · **ยังไม่เคยรันด้วย `psql` จริง ไม่เคยรันบน Supabase**
