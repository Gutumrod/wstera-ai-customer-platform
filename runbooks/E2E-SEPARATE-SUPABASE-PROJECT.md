# Runbook: G1 E2E บนโปรเจกต์ Supabase ทดสอบแยก

**สถานะ: รันครั้งเดียวบนโปรเจกต์ทดสอบด้วยข้อมูลสังเคราะห์ (2026-11-05)** · นี่คือระดับสูงสุดที่อ้างได้ · แต่ละขั้นด้านล่างระบุผลจริงพร้อมชื่อไฟล์หลักฐานดิบใน `evidence-aicp-20261105/` (เก็บใน vault ไม่อยู่ใน repo นี้ เพราะ repo เป็น public) · ขั้นที่ไม่มีหลักฐานคงเป็น **[ยังไม่ได้ลอง]** · ข้อมูลทั้งหมดเป็นข้อมูลสังเคราะห์ ไม่มีลูกค้าจริง ไม่มี traffic จริง รันครั้งเดียวจากเครื่อง Owner ในไทย ยังไม่ผ่านการตรวจอิสระของเอกสารนี้

> **เอกสารนี้ไม่ใช่การอนุญาต** การ apply migration, seed, แก้ dashboard และรัน E2E แต่ละอย่างต้องมี Owner GO ที่ **ระบุชื่อโปรเจกต์ทดสอบ** ก่อนเสมอ GO ที่ไม่ระบุชื่อ หรือ GO ของ `wstera-lab` ใช้ไม่ได้ ห้ามรันกับโปรเจกต์ที่ใช้ร่วมกับของอื่น repo นี้เป็น public: ห้ามใส่ project ref จริง, key, URL ที่มี password, หรืออีเมลที่ไม่ใช่ `@example.test` ลงไฟล์นี้หรือ commit ใด ๆ

อ้างอิงคำตัดสิน: D-20261103-31 (เป้า E2E = โปรเจกต์ Supabase ทดสอบแยก; พบในทะเบียน `vault-rules/06-Agent-Logs/WSTERA-House/DECISIONS-REGISTER.md` สถานะ LOCKED ตรวจเมื่อ 2026-11-05 · repo นี้มีเพียงแถวสรุปที่ `architecture/CORE-CONTRACT-v0.1.md:19` ไม่มีเนื้อคำตัดสินเต็ม), D-20261025-11 (schema `aicp` เท่านั้น ห้าม `public` ห้าม Docker Desktop) · ที่มาของรายการความเสี่ยง: `plans/HANDOFF-2026-11-03.md` ข้อ 4 และ 6 บน branch `claude/project-thread-8xgsii` (draft PR #27) ซึ่งตรวจซ้ำกับโค้ดแล้วในหัวข้อ 1 (เทียบ main @1b94ce5 ตรวจเมื่อ 2026-11-05 หลัง migration ทั้ง 5 ไฟล์ถูกแก้ให้รันด้วย role ที่ไม่ใช่ superuser) · ผล probe สิทธิ์จริงของ `postgres.<ref>` บนโปรเจกต์ทดสอบ: D-20261105-03 และ D-20261105-04 (หัวข้อ 3 ขั้น 4)

## 0. ก่อนเริ่ม: เงื่อนไขที่ต้องครบ (ผลที่เกิดจริงรอบ 2026-11-05)

- [x] Owner GO เป็นลายลักษณ์อักษรที่ระบุ **ชื่อโปรเจกต์ทดสอบ** (D-20261105-13 ถึง 21:00 ของวัน; แยก GO ตามขั้นยังเป็นกติกาสำหรับรอบถัดไป)
- [x] โปรเจกต์เป็นของใหม่ ไม่มีข้อมูลหรือผู้ใช้จริง: preflight แถว ord 60 `users=0 of which @example.test=0` (`01-preflight.txt`)
- [x] ใช้ host ของ **Session pooler** รูปแบบ `aws-N-<region>.pooler.supabase.com` (โปรเจกต์ทดสอบอยู่ eu-central-1) โค้ดปฏิเสธ host ตรงและ host รูปแบบอื่น (`platform/composition/knowledge-database-url.ts:12`, `scripts/seed-environment.mjs:23`)
- [x] อีเมลเจ้าของสังเคราะห์ลงท้าย `@example.test` (`scripts/seed-environment.mjs:26`) ตามที่ seed ใช้จริง (`32-seed.txt`)
- [x] เครื่องรัน: Node.js 22.13+ (รอบนี้ v24.19.0 ตามข้อความผิดพลาดใน `30-seed.txt`) และ npm; ที่เก็บ secret นอก repo
- [x] **`psql` ใช้งานได้:** รอบนี้ใช้ psql 17.11 (ติดตั้งแยก ไม่อยู่ใน PATH ต้องเรียกด้วย path เต็ม; ตรวจ `psql --version` ก่อนเริ่มทุกครั้ง) preflight และ probe และ apply ทั้ง 8 ไฟล์รันผ่าน `psql` จริง (`01`, `02`, `11` ถึง `19`) · ที่ยังไม่ได้ยืนยันคือ exit code 3 ของ `ON_ERROR_STOP` และ `\set`/`\echo` ใน preflight เพราะไฟล์หลักฐานเก็บเฉพาะ output ไม่เก็บ exit code · ข้อความในรอบก่อนหน้าที่ว่าเครื่องไม่มี `psql` **ผิด** (ตรวจไม่ถูกที่) · ไคลเอนต์รุ่นใดก็ได้ที่รองรับ `-X`, `-x`, `-v ON_ERROR_STOP=1`, `--single-transaction` และอ่าน `PGSSLMODE`/`PGSSLROOTCERT` ใช้ได้
- [x] ค่าลับไม่อยู่ใน `.env.local`: รอบนี้โหลดผ่าน `runtime/dispatch/with-aicp-test-env.mjs` (ตัวห่อใน workspace ไม่ใช่ใน repo นี้) ซึ่งอ่านที่เก็บ secret นอก repo เข้า env ของโปรเซสโดยไม่ echo และกรองค่าลับออกจาก output · คำสั่งทุกตัวที่ต้องใช้ env ของโปรเจกต์ทดสอบรันเป็น `node with-aicp-test-env.mjs <คำสั่ง>` · ห้าม echo/print ห้ามวางในแชต ถ้าเห็นค่า key หลุดใน output ให้หยุดและแจ้ง Owner ทันที (ถ้าไม่มีตัวห่อ ใช้ `.env.local` ตามหัวข้อ 2 ได้ ซึ่ง `.gitignore` บรรทัด 10-15 ignore ไว้ แต่วิธีนี้ **ยังไม่ได้ลอง** ในรอบนี้)

## 1. ผลตรวจซ้ำ 5 จุดสัมผัสของ PR #27 กับโค้ดจริง

ในหัวข้อ 1 `g1` = `supabase/migrations/20261023000100_g1_workspace_host.sql`

| # | ข้ออ้างใน PR #27 | ผลตรวจ | หลักฐาน (`path:line`) |
|---|---|---|---|
| 1 | role `aicp_migrator`/`knowledge_runtime` สร้างถ้าไม่มี ชื่อซ้ำแล้ว `ALTER ROLE` ทับ | **ล้าสมัย: main @1b94ce5 เปลี่ยนแล้ว** migration ไม่ `ALTER ROLE` ทับ role ใดอีก: ถ้าไม่มีจะสร้าง (`NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`); ถ้ามีและ attribute อันตราย (`aicp_migrator`: super/bypassrls/login/createdb/createrole/replication/inherit; `knowledge_runtime`: เหมือนกันยกเว้น login) จะ `RAISE AICP_MIGRATOR_ROLE_UNSAFE` / `KNOWLEDGE_RUNTIME_ROLE_UNSAFE`; ถ้ามีและ attribute ปลอดภัยจะถูก **นำมาใช้ต่อเงียบ ๆ** (aicp_migrator ได้เป็นเจ้าของ schema/ตาราง/ฟังก์ชัน, knowledge_runtime ได้ GRANT) preflight แถว 10-12 จึงยังต้อง STOP เมื่อมี role ชื่อซ้ำ · **seed ยังเป็นจุดสัมผัสที่ 6**: สั่ง `ALTER ROLE knowledge_runtime LOGIN PASSWORD` และตรวจแค่ไม่ใช่ superuser/bypassrls ดังนั้น role ชื่อซ้ำที่ไม่ใช่ superuser จะถูกตั้ง password ทับโดยไม่ถูกเตือน | `g1:79-102`, `g1:110-121`, `scripts/seed-local.mjs:28-33` |
| 2 | bucket `knowledge-originals` private 5 MB `ON CONFLICT DO UPDATE` | **ถูกบางส่วน (เปลี่ยนตาม main @1b94ce5)** ถ้าผู้รันมี SELECT บน `storage.buckets` ใช้ `ON CONFLICT DO UPDATE` ทับ `public`, `file_size_limit`, `allowed_mime_types` (4 ชนิด) ไม่ทับ `name`; ถ้าไม่มี SELECT ใช้ INSERT ธรรมดา ซึ่งไม่ทับแต่ **ทำให้ migration ไฟล์ 2 ล้มทั้งไฟล์** เมื่อ id ซ้ำ · probe วัดได้ INSERT/UPDATE และ SELECT (รอบ 1 นับแถว `storage.buckets` สำเร็จ, D-20261105-03; รอบ 2 D-20261105-04); DELETE = UNVERIFIED | `g1:123-138` |
| 3 | FK ไป `auth.users`, `GRANT USAGE ON SCHEMA auth`, seed สร้างผู้ใช้สังเคราะห์ 1 คน | **FK และ seed ถูก ส่วน `GRANT USAGE ON SCHEMA auth` ถูกเอาออกแล้ว** FK ยังอ้าง `auth.users` (ผู้รันต้องมี REFERENCES); แทนที่ด้วยฟังก์ชันห่อ `aicp.current_auth_uid()` (SECURITY DEFINER, `search_path = pg_catalog`, เจ้าของ = ผู้รัน migration) ที่เรียก `auth.uid()` แล้วให้ `is_active_workspace_member`, approve, revoke, archive เรียกฟังก์ชันห่อนี้ (policy `workspace_memberships_self_read` ยังเรียก `auth.uid()` ตรง ๆ) · seed สร้างผ่าน Auth Admin API (`email_confirm: true`) ไม่ใช่ SQL และถ้าอีเมลซ้ำจะค้นด้วย `listUsers` หน้าแรก 1000 คนเท่านั้น (โปรเจกต์ใหญ่อาจหาไม่เจอ → `LOCAL_AUTH_USER_NOT_FOUND`) | `g1:11`, `g1:35-41`, `g1:55`, `g1:69`, `20261103000100_host_hardening.sql:59`, `20261103000200_host_hardening_revoke.sql:28`, `:77`, `scripts/seed-local.mjs:14-23` |
| 4 | Data API ต้อง expose `aicp` โดยต่อท้าย และ PostgREST reload cache | **ส่วน "ต้อง expose" ถูก** (โค้ดเรียก `.schema("aicp")` ผ่าน Data API) **ส่วน "ต่อท้ายห้ามแทนที่" และ "reload schema cache" ไม่มีใน repo = UNVERIFIED** (เป็นพฤติกรรมของ dashboard/PostgREST ที่ repo ไม่พิสูจน์) | `platform/adapters/persistence/supabase/workspace-membership-repository.ts:9`, `knowledge-approval.ts:15`, `README.md:57`, `:70` ไม่พบ `NOTIFY pgrst` ในโค้ด/migration (มีเฉพาะใน comment ของ `scripts/e2e-rollback.sql`) |
| 5 | Pooler: ใช้ connection ร่วม | **ถูก** โค้ดบังคับ pooler เท่านั้น (`aws-N-*.pooler.supabase.com`, พอร์ต 5432/6543, db `postgres`, ไม่มี query/fragment, user `knowledge_runtime.<ref>` สำหรับ runtime และ `postgres.<ref>` สำหรับ seed) ปฏิเสธ host ตรง | `platform/composition/knowledge-database-url.ts:12-16`, `scripts/seed-environment.mjs:22-25` |
| ไม่แตะ | ไม่มี `CREATE EXTENSION`, ไม่แตะ `public` | **ถูก** ตามที่อ่าน migration 7 ไฟล์แรก (ไฟล์ที่ 8 `20261105000300_model_usage.sql` ตรวจด้วย `grep` ไม่พบ `CREATE EXTENSION` และไม่มี `CREATE FUNCTION`) ไม่พบ `CREATE EXTENSION` และทุก object อยู่ใน `aicp` (ยกเว้น role, bucket และสมาชิกภาพของผู้รันบน `aicp_migrator` ที่ GRANT/REVOKE ชั่วคราว) | `supabase/migrations/*.sql` (ทั้งแปดไฟล์) |

รายการ env ของ PR #27 ข้อ 6 **ขาด**: `NEXT_PUBLIC_APP_URL` (เช็ค same-origin ถ้าไม่ตั้งทุก POST ถูก 403 `ORIGIN_DENIED`, `platform/apps/merchant-console/lib/http.ts:10-11`), `KNOWLEDGE_RUNTIME_PASSWORD` (บังคับ 64 hex, `scripts/seed-environment.mjs:39-40`; seed ตั้งเป็น password ของ role และต้องตรงกับ password ใน `DATABASE_URL`), และ `LOCAL_OWNER_PASSWORD` (ยาว >= 20, `:42-43`; HANDOFF ข้อ 6 เขียนเป็นคำพูดว่า "รหัสผ่านเจ้าของสังเคราะห์" โดยไม่มีชื่อตัวแปร จึงขาดเฉพาะชื่อ) นอกจากนี้ seed ต้องการ `APP_ENV=lab` (`:35` ยอมรับ `local` ด้วย; ด่านที่บังคับ lab คือ `:45-48` ผ่าน `assertLab`) และ `NEXT_PUBLIC_APP_ENV=lab` (`:18`)

ช่องว่างอีกข้อ: seed สร้าง workspace เดียว `synthetic-shop` กับเจ้าของหนึ่งคน (`scripts/seed-local.mjs:34-48`) จึงยังไม่มีข้อมูลสำหรับทดสอบ **cross-workspace denial** ต้องเตรียมเพิ่มตามขั้น 7 ในข้อ 3

ความเสี่ยงที่เคยเป็น UNVERIFIED ก่อน apply และผลที่เกิดจริง: (ก) **ADMIN OPTION** บน role ที่ผู้รันสร้างเอง: apply ผ่านทั้ง 8 ไฟล์ และ SQL ตรวจหลัง apply ได้ `connected_user_admin_option_info_unverified_on_hosted` = `t` (`20-post-apply.txt`) (ข) `can_create_in_db`: probe ได้ `t` และ `CREATE SCHEMA` ผ่าน (`02-probe.txt`, `11-...knowledge.txt`) (ค) DELETE บน `storage.buckets` และ `storage.objects`: probe ได้ `t` ทั้งคู่ (`02-probe.txt`) แต่ **rollback ยังไม่ได้ลองจริง** (ง) `SET ROLE` ใน `--single-transaction` ผ่าน pooler session mode: ผ่านจริงทุกไฟล์ (`12` ถึง `19`; หลักฐานดิบไม่ระบุพอร์ต) หลัง apply `set_option_left` = 0 ทุกครั้ง · seed INSERT หลังโอนเจ้าของ: ผ่านจริงบน hosted เพราะ `rolbypassrls` = `t` (`32-seed.txt`) · พอร์ต 6543 (transaction mode) กับ DDL **ยังไม่ได้ลอง** · ถ้าครั้งหน้าเกณฑ์ใดเข้าข่ายล้มหรือ apply ล้ม ให้หยุดตามข้อ 5 ห้ามแก้สิทธิ์เพิ่มเอง (เช่น ห้าม `GRANT aicp_migrator TO` บัญชีที่ต่อ ด้วยมือ) จนกว่า Owner จะ GO ทางแก้

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
| `SUPABASE_DB_CA_CERT` | seed + host | ไฟล์ CA ที่ใช้จริงรอบนี้ผ่าน handshake TLS verify แล้ว (สคริปต์ `ca-handshake.mjs` ยิง SSLRequest แล้ว verify ด้วยไฟล์ CA ไม่ส่งรหัส; ไม่มีไฟล์ผลดิบแยก) · PEM ที่มี `BEGIN CERTIFICATE` ถ้าไม่มี หน้า login เปิดได้แต่ทุก route ที่สร้าง host ล้ม · `.env.local` เป็นบรรทัดเดียว: ใส่ในเครื่องหมายคำพูดคู่และแทนการขึ้นบรรทัดของ PEM ด้วย `\n` (UNVERIFIED ว่า dotenv ของ Next ที่ติดตั้งขยาย `\n` ตามนี้ ดูผลที่ว่า seed ผ่านด่าน `BEGIN CERTIFICATE`); PEM ดิบหลายบรรทัดไม่ใส่ quote ทำให้คีย์ถัดไปอ่านเพี้ยน |
| `SUPABASE_DB_ADMIN_URL` | seed + `psql` ทุกคำสั่งในไฟล์นี้ | pooler, user `postgres.<ref>`, ไม่มี query string (โค้ดปฏิเสธ จึงใส่ `sslmode` ใน URL ไม่ได้ ใช้ `PGSSLMODE` แทน) · `psql` อ่านจากตัวแปรนี้เสมอ ห้ามวาง URL ในบรรทัดคำสั่ง · เอา **ออก** จาก `.env.local` หลังเสร็จ |
| `PGSSLMODE`, `PGSSLROOTCERT` | `psql` เท่านั้น (ตั้งใน shell ของ operator ไม่ต้องอยู่ใน `.env.local`) | `PGSSLMODE=verify-full` และ `PGSSLROOTCERT` = path ไฟล์ CA (ดูข้อ 3) ไม่ใช่ secret แต่ path ต้องอยู่นอก repo |
| `KNOWLEDGE_RUNTIME_PASSWORD` | seed เท่านั้น | 64 hex (สร้างเองด้วยเครื่องมือสุ่ม ห้ามใช้ซ้ำกับที่อื่น) |
| `LAB_SEED_CONFIRM_PROJECT_REF` | seed เท่านั้น | เท่ากับ project ref |
| `LOCAL_OWNER_EMAIL`, `LOCAL_OWNER_PASSWORD` | seed เท่านั้น | อีเมลลงท้าย `@example.test`; password ยาว >= 20 |

## 3. ขั้นตอน (ผลที่เกิดจริงรอบ 2026-11-05)

ทุกขั้นที่เขียนฐานข้อมูลต้องมี Owner GO ที่ระบุชื่อโปรเจกต์ และต้องเก็บ **raw output** (ตัดค่า secret ออกก่อนบันทึก: ห้ามให้สตริงรูปแบบ key เช่น `AIza...`, `sb_secret_...`, `eyJ...`, password ใน URL ติดไปในไฟล์หลักฐาน)

**กติกาการเชื่อมต่อ `psql` (ใช้กับทุกคำสั่งในไฟล์นี้ รวม `scripts/*.sql`):**

- คำสั่งอ่าน URL จากตัวแปรสภาพแวดล้อมเท่านั้น: `psql "$SUPABASE_DB_ADMIN_URL" ...` ห้ามวาง URL (ซึ่งมี password) ในบรรทัดคำสั่ง ห้ามแทนที่ placeholder ด้วยค่าจริงในคำสั่งที่พิมพ์ ห้ามเขียนค่าลงไฟล์หลักฐาน
- นำค่าเข้าตัวแปรโดยไม่พิมพ์ค่าบนบรรทัดคำสั่งและไม่ echo (ค่าไม่แสดงบนจอ ไม่เข้า history) หรือโหลดจากที่เก็บ secret นอก repo · **ห้ามพิมพ์ `$env:SUPABASE_DB_ADMIN_URL = "ค่าจริง"` หรือ `export ...=ค่าจริง` ตรง ๆ** เพราะค่าเข้าประวัติ shell
  - Git Bash: `read -rs SUPABASE_DB_ADMIN_URL; export SUPABASE_DB_ADMIN_URL` แล้ววางค่าที่ prompt · จบงาน `unset SUPABASE_DB_ADMIN_URL`
  - PowerShell (`read -rs` ไม่มีใน PowerShell): `$s = Read-Host "DB admin URL" -AsSecureString; $env:SUPABASE_DB_ADMIN_URL = [System.Net.NetworkCredential]::new('', $s).Password; Remove-Variable s` แล้วเรียก `psql $env:SUPABASE_DB_ADMIN_URL ...` แทน `"$SUPABASE_DB_ADMIN_URL"` · จบงาน `Remove-Item Env:SUPABASE_DB_ADMIN_URL` (ตัวแปรอยู่เฉพาะ process นี้ ปิดหน้าต่างก็หาย) · ค่าจะอยู่ในหน่วยความจำและ environment ของ process ลูกที่ `psql` เห็น
  - **วิธีทั้งสองข้างบนยังไม่ได้ทดสอบ:** รอบจริงใช้ตัวห่อ `with-aicp-test-env.mjs` ตั้ง env ให้ `psql` แทน (ไม่ใช่ `read -rs` หรือ `Read-Host`) · คำสั่งตัวอย่างอื่นในไฟล์นี้เขียนด้วยไวยากรณ์ Git Bash (`"$VAR"`) ผู้รันบน PowerShell ต้องแปลงเอง · ห้ามรัน `env`, `set`, `printenv` หรือ `echo "$SUPABASE_DB_ADMIN_URL"` ใน session นี้
- ตรวจ TLS เต็มรูปแบบ: ตั้ง `PGSSLMODE=verify-full` และ `PGSSLROOTCERT=<path ไฟล์ CA นอก repo>` ก่อนรัน `psql` ใด ๆ (libpq อ่านสองตัวแปรนี้เอง; `sslmode=verify-full` ใน URL ทำไม่ได้เพราะโค้ดปฏิเสธ URL ที่มี query) ไฟล์ CA คือไฟล์ที่ดาวน์โหลดจาก dashboard ในขั้น 2 (เก็บไว้นอก repo; เนื้อเดียวกับที่ใส่ใน `SUPABASE_DB_CA_CERT`) ถ้า `psql` รายงานว่า verify ล้ม (certificate / hostname) = **STOP** ห้ามลด `sslmode` ลง
- ผลที่ถือว่ายังไม่ปลอดภัยที่จะ apply: `psql` exit code ไม่ใช่ 0, มีข้อความ `ERROR`, หรือมี `WARNING: no privileges were granted` / `no privileges could be revoked` (GRANT/REVOKE ที่ไม่ได้ผลจะเป็นแค่ WARNING และ `ON_ERROR_STOP` ไม่หยุดให้) → STOP
- หลักฐานบันทึกคำสั่งในรูปที่ใช้ชื่อตัวแปร (`psql "$SUPABASE_DB_ADMIN_URL" -X ...`) เท่านั้น
- ทุกคำสั่งใช้ `-X` (ไม่อ่าน `.psqlrc`); คำสั่งที่เขียนใช้ `-v ON_ERROR_STOP=1`

1. **ตรวจผูกชื่อ** Owner ยืนยันชื่อโปรเจกต์ + ref ตรงกับ GO · **ทำแล้ว** (D-20261105-13) ไม่มีไฟล์หลักฐานดิบ
2. **Owner dashboard ล่วงหน้า (ดาวน์โหลด CA cert):** Project Settings > Database > SSL certificate > ดาวน์โหลด CA เก็บนอก repo ใช้ทั้ง `SUPABASE_DB_CA_CERT` และ `PGSSLROOTCERT` · **ทำแล้ว** ไฟล์ที่ได้ผ่าน handshake TLS verify (ดูหัวข้อ 2 แถว `SUPABASE_DB_CA_CERT`)
3. **Preflight (อ่านอย่างเดียว):** `psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 -f scripts/e2e-preflight.sql` เก็บ output ดิบ · **ผ่านก็ต่อเมื่อครบทุกข้อ:** exit code 0, ไม่มีข้อความ `ERROR`, มีแถว `VERDICT` สถานะ `OK`, ไม่มีแถว `STOP`, และบรรทัดสุดท้ายคือ `PREFLIGHT_COMPLETE` · **อย่างอื่นทั้งหมดคือ STOP** รวมถึง: คำสั่งล้ม/exit code ไม่ใช่ 0, ผลว่าง 0 แถว, ไม่มีแถว `VERDICT`, ไม่มี `PREFLIGHT_COMPLETE` (การตรวจไม่จบ = ไม่ได้ตรวจ ไม่ใช่ "ไม่พบปัญหา") · แถว `identity:` 3 แถว (database, user, server version) ต้องเทียบกับ GO/หน้า Connect ของโปรเจกต์ที่ระบุ ถ้าไม่ตรง STOP (ดูข้อ 5) · **ผลจริง: ทำแล้ว ผ่าน** (`01-preflight.txt`): แถว `VERDICT` = `OK`, ไม่มีแถว `STOP`, จบด้วย `PREFLIGHT_COMPLETE`, role/bucket/schema ที่ migration จะสร้างว่างทั้งหมด, `auth.users` 0 แถว, แถว 40 (setting Data API) อ่านไม่ได้ตามที่คาด (INFO) · ไฟล์หลักฐานไม่มี exit code
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

   **ผล probe ที่เกิดจริงบนโปรเจกต์ทดสอบ** (อ่านอย่างเดียว; D-20261105-03, -04; output ดิบ `02-probe.txt`, ไม่ใส่ project ref):

   | ค่า | ผลจริง |
   |---|---|
   | `server_version` | 17.11 |
   | `rolsuper` / `rolcreaterole` / `rolbypassrls` / `rolinherit` | false / true / true / true |
   | `can_create_in_db` | true |
   | `createrole_self_grant` | ว่าง |
   | USAGE บน schema `auth` | true, **ไม่มี grant option** |
   | REFERENCES / SELECT บน `auth.users` | true / true |
   | EXECUTE บน `auth.uid()` | true |
   | USAGE บน schema `storage` | true |
   | INSERT / UPDATE / SELECT / DELETE บน `storage.buckets` | true / true / true / true |
   | SELECT / DELETE บน `storage.objects` | true / true |
   | ADMIN OPTION บน role ที่สร้างเอง | วัดก่อน apply ไม่ได้ (role ยังไม่มี); หลัง apply ได้ `t` (`20-post-apply.txt`) |

   **เกณฑ์ตัดสิน** (อนุมานจากกติกาของ PostgreSQL แล้ว **ทดสอบการล้มจริงบน PGlite** ด้วยการถอนสิทธิ์ทีละข้อ ไม่ใช่การลองบน hosted = ส่วนที่เป็นของ hosted ยัง **UNVERIFIED**; ถ้าข้อใดเข้าข่าย ให้ **STOP รายงาน Owner พร้อมผลดิบ ห้าม apply**; แถวที่ 2-8 ใช้เมื่อ `rolsuper` = false; `host_hardening` = `20261103000100_host_hardening.sql`, `revoke` = `20261103000200_host_hardening_revoke.sql`, `visibility` = `20261104000100_knowledge_visibility.sql`):

   | ผล probe | คำสั่งที่ล้ม / ผลที่ตามมา | บรรทัดอ้างอิง | ผลจริงเทียบเกณฑ์ |
   |---|---|---|---|
   | `server_version_num` < 160000 | ทุกไฟล์ที่มี `GRANT aicp_migrator TO ... WITH INHERIT FALSE, SET TRUE` (ไวยากรณ์ PG16+) ล้ม syntax error | `g1:106`, `host_hardening:16`, `revoke:16`, `visibility:23` | ผ่าน (17.11) |
   | `rolcreaterole` = false | `CREATE ROLE` ใน DO block: `permission denied to create role` | `g1:85`, `g1:97` (DO ที่ `g1:79-102`) | ผ่าน (true) |
   | `can_create_in_db` = false | `CREATE SCHEMA IF NOT EXISTS aicp` ล้มตั้งแต่ไฟล์แรก (`permission denied for database`) และ `ALTER SCHEMA aicp OWNER TO` ต้องการสิทธิ์เดียวกันตามกติกา PostgreSQL (ข้อนี้อนุมาน ไม่ได้แยกทดสอบ) | `20261022000100_knowledge.sql:1`, `g1:121` | ผ่าน (true; `CREATE SCHEMA` ผ่านจริง) |
   | `auth_users_references` = false | `CREATE TABLE aicp.workspace_memberships` ล้ม `permission denied for table users` | `g1:9-16` (FK ที่ `:11`) | ผ่าน (true) |
   | `auth_usage` = false | ตารางเดียวกันล้ม `permission denied for schema auth` | `g1:9-16` | ผ่าน (true) |
   | `auth_uid_execute` = false | **apply ผ่านเงียบ ๆ แต่ทุกการเรียก `aicp.current_auth_uid()` ล้มตอนรัน** `permission denied for function uid` (policy ของ `authenticated`, approve/revoke/archive) จึงเป็น STOP ตั้งแต่ probe | `g1:37-40`, `g1:55` | ผ่าน (true) |
   | `storage_usage` = false, หรือ `buckets_insert` = false, หรือ (`buckets_select` = true และ `buckets_update` = false) | บล็อก bucket ล้ม (`permission denied for schema storage` / `for table buckets`); `ON CONFLICT DO UPDATE` ต้องมี UPDATE ทุกครั้งที่มี SELECT | `g1:126-138` | ผ่าน (true / true / UPDATE = true); `buckets_select` = มี (วัดแล้ว) |
   | `rolbypassrls` = false | migration ผ่าน แต่ **seed INSERT ล้ม** `new row violates row-level security policy`: ตาราง workspace เป็นของ `aicp_migrator` RLS เปิดอยู่ มี policy อ่านอย่างเดียวให้ `authenticated`; GRANT ที่ migration ให้ผู้รัน (`g1:140-144`) ให้สิทธิ์ตาราง แต่ไม่ให้ข้าม RLS | `scripts/seed-local.mjs:34-48` | ผ่าน (true) |
   | `rolsuper` = true | ไม่เข้าเกณฑ์ข้างบนข้อใด (superuser ข้ามทุกด่านนี้) แต่บน hosted ที่ได้ superuser ถือว่าผิดคาด → รายงานผลดิบให้ Owner ดูก่อน | - | ผ่าน (false) |

   **เกณฑ์ที่เลิกใช้แล้ว** (เทียบกับร่างก่อน main @1b94ce5): `createrole_self_grant` ไม่มี `set`/`inherit` และ `auth_usage_grantable` = false เคยทำให้ล้ม แต่ migration ใหม่ขอ SET เองด้วย `GRANT ... WITH INHERIT FALSE, SET TRUE` ผ่าน ADMIN OPTION และไม่ GRANT อะไรบน schema `auth` ให้ใครแล้ว (ทดสอบบน PGlite ว่าผ่านเมื่อ `createrole_self_grant` ว่างและ USAGE บน `auth` ไม่มี grant option) · ค่าสองตัวนี้ยังอยู่ใน SQL ข้างบนเป็นข้อมูล ไม่ใช่เกณฑ์

ผลอื่นที่ไม่เข้าเกณฑ์ใดเลย **ไม่ใช่การรับรองว่า apply จะผ่าน** แค่ว่ายังไม่พบเหตุให้หยุดจาก probe นี้ · รอบนี้ผล probe ไม่เข้าเกณฑ์ล้มข้อใด และ apply ผ่านทั้ง 8 ไฟล์ตามมา (ขั้น 5) · ห้ามแก้เกณฑ์ที่ล้มด้วยมือ (เช่น `GRANT aicp_migrator TO ...`, `ALTER ROLE ... CREATEROLE`) หรือแก้ migration/seed เอง ต้องให้ Owner ตัดสินทางแก้เป็น GO แยก · **ทำแล้ว: `02-probe.txt`**
5. **Apply** 8 ไฟล์ตามลำดับ (ลำดับชื่อไฟล์ = ลำดับ apply) · ทำเมื่อ preflight ผ่านและ probe ไม่เข้าเกณฑ์ล้มเท่านั้น · **ผลจริง: ทำแล้ว ผ่านครบ 8 ไฟล์ ไม่มี ERROR ไม่มี WARNING** (`11` ถึง `19`; `13-dup-check.txt` ได้ 0 แถว) · หลักฐานดิบไม่ระบุพอร์ต; พอร์ต 5432 (session mode) คือที่เอกสารแนะนำ ส่วน 6543 (transaction mode) กับ DDL **[ยังไม่ได้ลอง]**
   ```
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261022000100_knowledge.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261023000100_g1_workspace_host.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 -f scripts/check-web-connection-duplicates.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261103000100_host_hardening.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261103000200_host_hardening_revoke.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261104000100_knowledge_visibility.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261105000100_web_chat_host.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261105000200_durable_handoff.sql
   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261105000300_model_usage.sql
   ```
   คำสั่งที่สามคือ pre-check ก่อน migration ที่สามตามที่ `README.md` กำหนด (ต้องได้ 0 แถว; บนโปรเจกต์ใหม่ตารางว่างจึงควรว่างเสมอ ถ้ามีแถว STOP) · ตรวจ output ของทุกคำสั่งตามกติกา `WARNING: no privileges...` ด้านบน · ถ้าไฟล์ใดล้ม หยุด เก็บ error ดิบ ห้ามรันซ้ำจนกว่าจะเข้าใจสาเหตุ (ไม่มี down migration; ดู `scripts/e2e-rollback.sql`) · ไฟล์ 2-8 ขอสิทธิ์ `SET` บน `aicp_migrator` ชั่วคราวผ่าน ADMIN OPTION ของผู้รัน (`GRANT aicp_migrator TO <ผู้รัน> WITH INHERIT FALSE, SET TRUE`) ใช้ `SET ROLE` สร้าง object แล้ว `RESET ROLE` กับ `REVOKE SET OPTION` ท้ายไฟล์ · เพราะใช้ `--single-transaction` ไฟล์ที่ล้มจะถอยทั้งไฟล์รวมการ GRANT ชั่วคราว (ไม่ควรเหลือ SET ค้าง; ตรวจด้วย SQL ด้านล่าง) · apply ครบแล้วให้รัน SQL ตรวจหลัง apply ในหัวข้อ 4 ก่อน seed · ไฟล์ที่ 8 (`model_usage`) apply หลังไฟล์ 1-7 ในวันเดียวกัน (ไฟล์ 1-7 ช่วงบ่าย ไฟล์ 8 หลังรวมโค้ดเส้นโมเดลเข้า main) ผ่านด้วยวิธีเดียวกัน (`19-20261105000300_model_usage.txt`)
6. **Owner dashboard: expose schema `aicp`** Project Settings > API (Data API) > Exposed schemas: **เพิ่ม** `aicp` ต่อท้ายรายการเดิม ห้ามแทนที่รายการ แล้วบันทึก · **ผลจริง: ทำแล้ว** Owner เปิดเอง อ่านกลับผ่าน Data API ได้ status 200 และ `db_schema` = `public,graphql_public,aicp` (รายการเดิมยังอยู่ แปลว่าต่อท้ายได้จริง) กับ `extra_search_path` = `public,extensions` (`34-data-api.txt`) · การ reload schema cache ไม่ได้ตรวจแยก (ผลอ่านกลับผ่านแล้ว) · ผลของการแทนที่รายการ **[ยังไม่ได้ลอง]**
7. **Seed:** ตั้ง env ตามข้อ 2 และกำหนด `WEB_CHAT_ALLOWED_ORIGINS` เป็นรายการ exact origin คั่นด้วย comma (ถ้าไม่ตั้ง จะปฏิเสธทุก origin) แล้ว `npm run seed:local` · **ผลจริง: รัน 3 ครั้ง สำเร็จครั้งที่ 3** ครั้งแรกล้มที่ `import { loadEnvConfig } from "@next/env"` (`30-seed.txt`) ครั้งที่สองล้ม `could not determine data type of parameter $1` (`31-seed.txt`) ทั้งสองเป็นบั๊กของสคริปต์ seed แก้แล้วในคอมมิต `e30c458` (`fix(seed): make the lab seed run on real Postgres`) ครั้งที่สามพิมพ์ `Seeded one lab synthetic owner, workspace, and web connection.` (`32-seed.txt`) · seed สั่ง `ALTER ROLE knowledge_runtime LOGIN PASSWORD` (ปลอดภัยเฉพาะเมื่อ preflight ผ่าน) และสร้าง workspace `synthetic-shop` · ว่าสองครั้งแรกล้มก่อนถึง `ALTER ROLE` เป็นข้อสรุปจากข้อความ error ไม่ได้ตรวจสถานะ role ซ้ำ **[ยังไม่ได้ลอง]**
   - **ล้มกลางทางได้:** `ALTER ROLE ... LOGIN PASSWORD` (`seed-local.mjs`) รันก่อน INSERT (INSERT ถัดมา) ถ้า INSERT ล้ม (เช่น `rolbypassrls` = false ตามเกณฑ์ข้อ 8 ในขั้น 4: ตารางเป็นของ `aicp_migrator` และ RLS เปิดอยู่) role จะเป็น LOGIN พร้อม password แล้วแต่ไม่มีข้อมูล = สภาพครึ่งทาง ให้ STOP รายงาน Owner เก็บ error ดิบ ห้ามรัน seed ซ้ำ · รอบจริงไม่เกิดกรณีนี้ (INSERT ผ่านเพราะ `rolbypassrls` = true)
   - **password ในคำสั่ง DDL:** seed ส่ง `ALTER ROLE ... PASSWORD '<ค่า>'` เป็น SQL ปกติ จึงอาจถูกบันทึกใน statement log ของเซิร์ฟเวอร์ (UNVERIFIED ว่า hosted log คำสั่งนี้หรือไม่; ไม่แก้ได้ในเอกสารนี้ เพราะต้องแก้ `scripts/seed-local.mjs`) ใช้ `KNOWLEDGE_RUNTIME_PASSWORD` ที่สุ่มใหม่เฉพาะโปรเจกต์ทดสอบนี้ และถือว่าเผาทิ้งพร้อมโปรเจกต์
   - **ข้อมูล cross-workspace (ไม่มีใน seed):** รอบจริงเตรียมด้วยสคริปต์ `seed-negative.mjs` (อยู่ใน `evidence-aicp-20261105/` ไม่อยู่ใน repo) สร้างผ่าน Auth Admin API ผู้ใช้ `second@example.test` (ไม่มี membership), `staff@example.test` (role staff ของ `synthetic-shop`), `other-owner@example.test` (owner ของ workspace `other-shop`) ผลดิบ `33-seed-negative.txt`: membership ได้ `synthetic-shop` owner 1, `synthetic-shop` staff 1, `other-shop` owner 1
8. **เริ่ม host แบบ lab:** รอบจริงรันผ่านตัวห่อ: `node with-aicp-test-env.mjs bash -c 'npm run dev:console'` (ใน repo นี้ใช้ `.env.local` ไม่ได้ตามที่ตกลง) พอร์ต 3000 แล้วรอบวัด latency ใช้ `start:console` (build จริง ไม่ใช่ dev mode) พอร์ตเดิม (`70-latency-start-console.txt`) · ดู log ว่า host ฟังพอร์ตที่ตรงกับ `NEXT_PUBLIC_APP_URL` จริง ถ้าพอร์ตถูกใช้อยู่ Next อาจเลื่อนไปพอร์ตอื่น ทำให้ origin ไม่ตรงและทุก POST ถูก 403 `ORIGIN_DENIED` (`lib/http.ts:10-11`) → ปิดตัวที่ใช้พอร์ตแล้วเริ่มใหม่ ห้ามแก้ค่าให้ผ่านโดยไม่เข้าใจ · **ทำแล้ว**
9. **ตรวจ E2E** ตามเช็กลิสต์ข้อ 4 · **ผลจริง: ทำแล้วบางส่วน** ระดับ API ผ่าน 26/26 (`41-e2e-api.txt`) รอบซ้ำ 25/26 (`42-e2e-api-rerun.txt` ข้อที่ตกคือสคริปต์นับแหล่งตายตัว ดูหัวข้อ 8) และลองมือบนเบราว์เซอร์เฉพาะหน้าแชตลูกค้า · ฟอร์ม login, knowledge console และ `/handoffs` บนเบราว์เซอร์ ลองแล้ว ดูหัวข้อ 4 และ 10 · เก็บ log terminal ของ host, network/console (ตัด cookie/token) และ output SQL ตรวจยืนยัน
10. **จบงาน:** ลบ `SUPABASE_DB_ADMIN_URL`, `SUPABASE_SECRET_KEY`, `KNOWLEDGE_RUNTIME_PASSWORD`, `LOCAL_OWNER_PASSWORD`, `DATABASE_URL`, `SUPABASE_DB_CA_CERT` และค่า ref ออกจากที่เก็บชั่วคราว, ปิด shell ที่ตั้ง `SUPABASE_DB_ADMIN_URL`/`PGSSLROOTCERT` (หรือ `unset`) และลบไฟล์ CA ที่ดาวน์โหลด, หมุน/ลบ key ของโปรเจกต์ถ้าเคยวางที่อื่น, แล้วรื้อโปรเจกต์ทดสอบทั้งก้อน (ทางที่แนะนำ) หรือใช้ `scripts/e2e-rollback.sql` · **[ยังไม่ได้ทำ]** รอบ 2026-11-05 โปรเจกต์และค่าลับยังอยู่ (งานเก็บกวาดปลายวัน) และ `scripts/e2e-rollback.sql` **ไม่เคยลอง** ทั้งยังไม่ได้ตรวจว่าครอบคลุมตาราง `aicp.model_usage` ของไฟล์ที่ 8

## 4. เช็กลิสต์ E2E (ผลจริงรอบ 2026-11-05)

ผ่านต้องมีหลักฐานแนบ ไม่ใช่แค่ติ๊ก · **[x]** = มีผลดิบ, **[ ]** = ยังไม่ได้ลอง/รอ Owner · ผลระดับ API มาจาก `41-e2e-api.txt` (ครั้งแรก) และ `42-e2e-api-rerun.txt` (ซ้ำ)

- [x] **Sign-in (API):** เจ้าของสังเคราะห์ sign-in ด้วยรหัสผ่านบน Auth จริงผ่าน · [x] **Sign-in (ฟอร์ม `/login` บนเบราว์เซอร์):** Owner พิมพ์รหัสเองใน Browser pane แล้วเข้าหน้า Knowledge Desk ได้ (`80-owner-ui-notes.md`) ผู้ช่วยไม่พิมพ์แทนเพราะฟอร์มส่งรหัสไป `supabase.co`
- [x] **Upload:** อัปโหลด FAQ x3 (เวลาทำการ, เวลาจัดส่ง, internal-only), CSV ราคาสินค้า, PDF Warranty policy สังเคราะห์สำเร็จ status 201 ใช้เวลา 6-9 วินาทีต่อไฟล์ (จากเครื่องในไทยไป eu-central-1) · PDF เสียถูกปฏิเสธ 422 · เวอร์ชันขึ้นสถานะ `indexed` · [ ] ต้นฉบับอยู่ใน bucket `knowledge-originals` (private): ไม่มีผลตรวจ bucket แยก
- [ ] **Review: ไม่ผ่าน** ลองบนเบราว์เซอร์แล้ว knowledge console แสดงแค่สถานะ จำนวน chunk และรหัสเวอร์ชัน ไม่แสดงข้อความที่สกัด เจ้าของร้านจึงอนุมัติโดยไม่เห็นเนื้อหา (B-12) · อัปโหลด FAQ, CSV, PDF และกดอนุมัติผ่านฟอร์มได้ (`81-console-upload-visibility.txt`) · รอบแรกฟอร์มไม่มีช่อง visibility เอกสารเป็น `internal` ทุกไฟล์ บอทตอบไม่ได้ แก้แล้วใน PR #46 ลองซ้ำแล้วบอทตอบจากเอกสารที่อัปโหลดผ่านฟอร์มได้
- [x] **Approve:** เจ้าของอนุมัติทั้ง 5 แหล่งผ่าน RPC `aicp.approve_knowledge_version` (`supabase/migrations/20261103000100_host_hardening.sql:52-105`) ได้ status 200 และสถานะเวอร์ชันเป็น `approved` (`42-e2e-api-rerun.txt` แถว versions) แปลว่า `auth.uid()` ผ่านฟังก์ชันห่อ `aicp.current_auth_uid()` ใช้งานได้จริงผ่าน PostgREST บน hosted · [ ] ค่า `approved_by` = uid เจ้าของ: ไม่ได้ตรวจในหลักฐาน
- [x] **Search + citation:** ค้นแล้วได้หลักฐานพร้อม citation (top = เวลาทำการ), ค้นถึงเนื้อ PDF และ CSV ได้ · FAQ internal ไม่รั่วออกหน้าแชตลูกค้า (ลองมือบนเบราว์เซอร์, HANDOFF 15:55; ไม่มีไฟล์ดิบแยก) · [ ] เวอร์ชันที่ถูก revoke ต้องไม่ถูกคืน: ลองผ่านหน้าเว็บไม่ได้ เพราะไม่มี route revoke ใน console ต้องเรียก RPC `aicp.revoke_knowledge_version` ด้วยผู้ใช้เจ้าของ (หัวข้อ 8)
- [x] **Cross-workspace denial:** (ก) ผู้ใช้ที่ไม่มี membership: upload/search ถูกปฏิเสธ 403 `MEMBERSHIP_REQUIRED` และ `/api/handoffs` ได้ 403 `MEMBERSHIP_REQUIRED` (`50-handoffs-auth-rerun.txt`); (ข) ร้านอื่น (`other-shop`) เห็นเฉพาะข้อมูลตัวเองในรอบแรก และร้านแรกค้นข้อมูลร้านอื่นไม่เจอ (รอบซ้ำข้อ "other shop sees only its own source" ตกเพราะสคริปต์ ดูหัวข้อ 8); (ค) POST ไม่มี/ผิด `Origin` ได้ 403; anonymous ได้ 401
- [x] **Negative:** staff อนุมัติไม่ได้ ได้ 403 (`staff cannot approve`) · ผลดิบพิมพ์เฉพาะ status ไม่ได้ยืนยันโค้ด `OWNER_ROLE_REQUIRED`

- [x] **แชตลูกค้าและ handoff** (ลองมือบนเบราว์เซอร์หน้า `/chat?c=synthetic-web` ตาม HANDOFF 15:55 และ 17:40 ไม่มีไฟล์ดิบแยก ยกเว้นข้อบั๊กซ้ำ): คำตอบมีแหล่งอ้างอิง, ตอบไม่ได้ขอโทษแล้วปุ่มล็อก, ข้อมูล internal ไม่รั่ว, ระหว่าง `handoff_requested` บอทยังตอบต่อ, พนักงานตอบแล้ว (`human_active`) ลูกค้าเห็นและบอทหยุด, ปล่อยคืนแล้วปุ่มกลับมา, รีเฟรชลำดับถูกและไม่ซ้ำ · บั๊ก 3 ข้อที่ E2E เจอ (เวลาข้อความเท่ากันทำให้พนักงานเห็นบอทก่อนลูกค้า, `/api/handoffs` ตอบ 500 แทน 403, poll ค้างปลดล็อกปุ่ม) แก้ใน main (PR #44) และลองซ้ำผ่าน: `50-handoffs-auth-rerun.txt`, `51-staff-order-rerun.txt` · [ ] หน้า React `/handoffs` บนเบราว์เซอร์: **รอ Owner ลอง**

### SQL ตรวจหลัง apply (อ่านอย่างเดียว รันบน hosted แล้ว ทุกค่าตรงที่คาด: `20-post-apply.txt`)

รันด้วย `psql "$SUPABASE_DB_ADMIN_URL" -X -x -v ON_ERROR_STOP=1` (`-x` = หนึ่งคอลัมน์ต่อบรรทัด; วาง SQL ด้านล่างทาง stdin) หลัง apply ครบ (ผลจริงรันหลังไฟล์ 1-7, `all_as_expected_expect_true` = `t`; ไฟล์ที่ 8 ไม่มีฟังก์ชันใหม่ จำนวน `aicp_functions_expect_11` จึงยังเป็น 11) แต่ละคอลัมน์ต้องเท่าค่าที่ชื่อบอก (`..._expect_2`, `..._expect_aicp_migrator`, `..._expect_true`, `..._expect_false`, `..._expect_0`) และ `all_as_expected_expect_true` ต้องเป็น `t` · ค่าอื่นให้หยุดตามหัวข้อ 5 เก็บ output ดิบ · `..._info_...` เป็นข้อมูลอย่างเดียว ไม่มีค่าคาด: `current_auth_uid_owner_info` ควรเท่ากับ `identity: current_user` ของ preflight (เจ้าของ `aicp.current_auth_uid()` คือผู้รัน migration ไม่ใช่ `aicp_migrator` ตั้งใจให้เป็นอย่างนั้นเพื่อให้เรียก `auth.uid()` ได้โดยไม่ต้อง GRANT บน schema `auth`), `connected_user_admin_option_info_unverified_on_hosted` ควรเป็น `t` (ถ้าเป็น `f` หรือว่าง ให้รายงาน Owner: ใช้ rollback ส่วน 3-4 ไม่ได้ตามที่เขียน) · ถ้าเชื่อมต่อเป็น superuser `connected_user_can_set_aicp_migrator_expect_false` จะเป็น `t` เสมอ ซึ่งผิดคาดสำหรับ hosted (probe ว่า `rolsuper` = false) · คอลัมน์ `connected_user_set_grants_on_aicp_migrator_expect_0` ยืนยันว่า migration ถอน SET ครบทุกแถวสมาชิกภาพ ไม่ใช่แค่ผลรวม

```sql
SELECT x.*,
  (x.revoke_archive_functions_expect_2 = 2 AND x.triggers_expect_2 = 2 AND x.visibility_column_expect_1 = 1
   AND x.aicp_functions_expect_11 = 11
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
    (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'aicp'::regnamespace) AS aicp_functions_expect_11,
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

ตรวจเพิ่มสำหรับ migrations `20261105000100_web_chat_host.sql` และ `20261105000200_durable_handoff.sql` ด้วยคำสั่งอ่านอย่างเดียวนี้ ตารางคอลัมน์และ policy ต้องครบตาม expected; grants ต้องเป็น `t`/`f` ตามชื่อ; `handoff_migrations_as_expected` ต้องเป็น `t`. ใช้ผลนี้ร่วมกับ query ก่อนหน้า และห้าม seed ถ้าค่าใดไม่ตรง · **ผลจริง:** ทุกค่าตรงที่คาด `handoff_migrations_as_expected` = `t` (`21-post-apply2.txt`)

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='aicp' AND ((table_name='workspaces' AND column_name='query_aliases') OR (table_name='workspace_connections' AND column_name='allowed_origins'))) AS web_host_columns_expect_2,
  (SELECT count(*) FROM pg_policies WHERE schemaname='aicp' AND policyname IN ('workspaces_web_runtime_read','workspace_connections_web_runtime_read')) AS web_host_policies_expect_2,
  has_column_privilege('knowledge_runtime','aicp.workspaces','query_aliases','SELECT') AS query_aliases_column_grant_expect_true,
  has_column_privilege('knowledge_runtime','aicp.workspace_connections','allowed_origins','SELECT') AS allowed_origins_column_grant_expect_true,
  (SELECT count(*) FROM information_schema.tables WHERE table_schema='aicp' AND table_name IN ('conversations','conversation_events','conversation_messages','handoff_notifications')) AS handoff_tables_expect_4,
  (SELECT count(*) FROM pg_policies WHERE schemaname='aicp' AND policyname IN ('conversations_workspace_isolation','conversation_events_workspace_isolation','conversation_messages_workspace_isolation','handoff_notifications_workspace_isolation')) AS handoff_policies_expect_4,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='aicp' AND table_name='conversation_messages' AND column_name IN ('id','workspace_id','conversation_id','role','body','staff_id','delivery_id','created_at')) AS message_columns_expect_8,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='aicp' AND c.relname IN ('conversations','conversation_events','conversation_messages','handoff_notifications') AND c.relrowsecurity AND c.relforcerowsecurity) AS forced_rls_tables_expect_4,
  has_table_privilege('knowledge_runtime','aicp.conversations','SELECT,INSERT,UPDATE') AS conversations_runtime_grant_expect_true,
  has_table_privilege('knowledge_runtime','aicp.conversation_events','SELECT,INSERT') AND NOT has_table_privilege('knowledge_runtime','aicp.conversation_events','UPDATE,DELETE') AS events_append_only_grant_expect_true,
  has_table_privilege('knowledge_runtime','aicp.conversation_messages','SELECT,INSERT') AS messages_runtime_grant_expect_true,
  has_table_privilege('knowledge_runtime','aicp.handoff_notifications','SELECT,INSERT,UPDATE') AS notifications_runtime_grant_expect_true,
  ((SELECT count(*) FROM information_schema.columns WHERE table_schema='aicp' AND ((table_name='workspaces' AND column_name='query_aliases') OR (table_name='workspace_connections' AND column_name='allowed_origins'))) = 2
   AND (SELECT count(*) FROM pg_policies WHERE schemaname='aicp' AND policyname IN ('workspaces_web_runtime_read','workspace_connections_web_runtime_read')) = 2
   AND has_column_privilege('knowledge_runtime','aicp.workspaces','query_aliases','SELECT')
   AND has_column_privilege('knowledge_runtime','aicp.workspace_connections','allowed_origins','SELECT')
   AND (SELECT count(*) FROM information_schema.tables WHERE table_schema='aicp' AND table_name IN ('conversations','conversation_events','conversation_messages','handoff_notifications')) = 4
   AND (SELECT count(*) FROM pg_policies WHERE schemaname='aicp' AND policyname IN ('conversations_workspace_isolation','conversation_events_workspace_isolation','conversation_messages_workspace_isolation','handoff_notifications_workspace_isolation')) = 4
   AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='aicp' AND table_name='conversation_messages' AND column_name IN ('id','workspace_id','conversation_id','role','body','staff_id','delivery_id','created_at')) = 8
   AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='aicp' AND c.relname IN ('conversations','conversation_events','conversation_messages','handoff_notifications') AND c.relrowsecurity AND c.relforcerowsecurity) = 4
   AND has_table_privilege('knowledge_runtime','aicp.conversations','SELECT,INSERT,UPDATE')
   AND has_table_privilege('knowledge_runtime','aicp.conversation_events','SELECT,INSERT')
   AND NOT has_table_privilege('knowledge_runtime','aicp.conversation_events','UPDATE,DELETE')
   AND has_table_privilege('knowledge_runtime','aicp.conversation_messages','SELECT,INSERT')
   AND has_table_privilege('knowledge_runtime','aicp.handoff_notifications','SELECT,INSERT,UPDATE')) IS TRUE AS handoff_migrations_as_expected;
```

ตรวจไฟล์ที่ 8 `20261105000300_model_usage.sql` (ผลจริงท้าย `19-20261105000300_model_usage.txt`; SQL ที่รันเป็นคำสั่ง inline ไม่ได้เก็บเป็นไฟล์): `aicp.model_usage` เปิด RLS และ FORCE RLS (`relrowsecurity` = `t`, `relforcerowsecurity` = `t`), `authenticated` และ `anon` ไม่มีสิทธิ์ระดับตารางและระดับคอลัมน์ (ได้ 0 แถว), เจ้าของตาราง = `aicp_migrator`, `set_option_left` = 0

**ข้อควรระวังตอนตรวจ grant:** บัญชี admin (`postgres.<ref>`) **ไม่มีสิทธิ์ตรงบนตาราง `aicp`** (ตารางเป็นของ `aicp_migrator`) การถาม `information_schema.table_privileges` / `column_privileges` ด้วยบัญชีนี้จึงได้ 0 แถวทั้งที่ GRANT มีอยู่ (view เหล่านี้ตัดสิทธิ์ที่ role ปัจจุบันไม่เกี่ยวข้องออก ตามเอกสาร PostgreSQL) ผล 0 แถวนี้จึง **ไม่ใช่หลักฐานว่าไม่มี grant** · ให้ตรวจด้วย `has_table_privilege` / `has_column_privilege` ของ role ที่ต้องการ (แบบเดียวกับ SQL ด้านบน) หรือ `pg_class.relacl`

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

หลักฐานดิบของรอบ 2026-11-05 เก็บใน vault ที่ `06-Agent-Logs/WSTERA-House/evidence-aicp-20261105/` (ไฟล์ `01` ถึง `70` อ้างตามชื่อในเอกสารนี้) ผู้อ่านนอก vault ตรวจซ้ำไม่ได้จาก repo นี้

WEBCHAT-HOST-001 / HANDOFF-002 / เส้นโมเดล: migration ทั้ง 8 ไฟล์ apply บนโปรเจกต์ทดสอบแล้ว (ขั้น 5)

## 7. ยังไม่ได้ลอง (UNVERIFIED)

ไม่มีข้อใดด้านล่างมีหลักฐาน ห้ามเดาว่าผ่าน:


- DDL ผ่าน pooler transaction mode (6543) · `ON_ERROR_STOP` exit code 3 ของ `psql` และการทำงานของ `\set`/`\echo` ใน preflight (ไฟล์หลักฐานไม่เก็บ exit code)
- **rollback ทุกทาง** (`scripts/e2e-rollback.sql`) และการรื้อโปรเจกต์ · DELETE บน `storage.*` วัดได้ว่ามีสิทธิ์ (`02-probe.txt`) แต่ยังไม่เคยลบจริง
- ผลของการแทนที่รายการ Exposed schemas (แทนที่แล้วหายหรือไม่) · การ reload schema cache แยกจากการอ่านกลับ
- ว่า hosted บันทึกคำสั่ง `ALTER ROLE ... PASSWORD` ใน statement log หรือไม่ · ว่า dotenv รับ PEM แบบ `\n` (รอบจริงไม่ใช้ `.env.local`)
- ต้นฉบับใน bucket `knowledge-originals` เป็น private จริง (ไม่มีผลตรวจ bucket) · `approved_by` = uid เจ้าของ
- การ revoke/archive ผ่านหน้าเว็บ: ไม่มี route หรือ UI เรียก `SupabaseKnowledgeRevocation` (`platform/adapters/persistence/supabase/knowledge-revocation.ts:17` อ้างถึงเฉพาะในเทสต์) ตรวจได้เพียงเรียก RPC ตรง
- latency บนโฮสต์จริงที่อยู่ใกล้ฐานข้อมูล · การเลือก region · ความสามารถรับโหลด · คุณภาพคำตอบนอกชุดคำถามสังเคราะห์ 19 ข้อ
- การทำงานของเพดานโมเดลต่อ token (`max_completion_tokens` ถูกรับโดยไม่ error แต่ยังไม่พิสูจน์ว่า provider เคารพ) · การตั้งเพดานแยกต่อคีย์ของ provider (รอ Owner สร้าง 4 คีย์ทดสอบ)
- การตรวจอิสระของเอกสารนี้ · ทุกอย่างที่เกี่ยวกับ traffic, ลูกค้า หรือข้อมูลจริง

**ทดสอบบนจำลอง (ไม่ใช่ Supabase):** PGlite = PostgreSQL 18.3 ผู้รันจำลองเป็น role ที่ไม่ใช่ superuser (`CREATEROLE BYPASSRLS`, `createrole_self_grant` ว่าง, USAGE บน `auth` โดยไม่มี grant option ฯลฯ) ใน `platform/adapters/persistence/supabase/hosted-role-compat.test.ts` ครอบคลุม migration ทั้ง 8 ไฟล์ โดย `auth`/`storage` เป็น stub

## 8. ที่พบจริงตอนรัน (2026-11-05)

- **ตัวห่อ env แทน `.env.local`:** ใน repo ใช้ `.env.local` ไม่ได้ ใช้ `runtime/dispatch/with-aicp-test-env.mjs` โหลดค่าจากที่เก็บ secret เข้า env ของโปรเซสและกรองค่าลับจาก output
- **ไฟล์ CA:** ต้องมีไฟล์ CA ที่ดาวน์โหลดจาก dashboard และ handshake TLS verify ผ่านแล้ว (`ca-handshake.mjs`) ก่อนใช้งานจริง
- **บัญชี admin ไม่มีสิทธิ์ตรงบนตาราง `aicp`:** ตรวจ grant ผ่าน `information_schema` ได้ 0 แถว ต้องใช้ `has_*_privilege` (ดูท้ายหัวข้อ 4)
- **role runtime (`knowledge_runtime`) แก้คอลัมน์ revoke ไม่ได้:** การถอนเอกสารต้องเรียก RPC `aicp.revoke_knowledge_version` ด้วยผู้ใช้เจ้าของ ไม่มีปุ่มหรือ route ใน console (พบตอนล้างข้อมูลซ้ำ; มาจากคำสั่งงานและ HANDOFF 17:40 ไม่มีไฟล์ผลดิบ)
- **สคริปต์ e2e รันซ้ำสร้างแหล่งซ้ำ:** `e2e-api.mjs` อัปโหลดชื่อเดิมซ้ำโดยไม่มีด่านกันเนื้อซ้ำ รอบซ้ำจึงได้แหล่ง "ข้อมูลร้านอื่น" 2 แถว (`42-e2e-api-rerun.txt` ข้อที่ตก) และถ้าแหล่งซ้ำถูกอนุมัติ extractive จะตอบซ้ำสองรอบ (HANDOFF 17:40 ไม่มีไฟล์ผลดิบแยก) · ยืนยันแยกแล้วว่าร้านอื่นเห็นเฉพาะของตัวเอง · สคริปต์แก้แล้วแต่ยังไม่ได้รันเต็มซ้ำ เพราะจะสร้างข้อมูลซ้ำอีก
- **ฟอร์ม login ส่งรหัสจากเบราว์เซอร์ไป `supabase.co`:** ผู้ช่วยพิมพ์รหัสแทนไม่ได้ Owner ต้องพิมพ์เองใน Browser pane (รหัสห้ามวางในแชต)
- **เวลา:** ตอบแชต P50 8.4 วินาที P95 8.6 วินาที, ส่งต่อพนักงาน P50 7.8 วินาที P95 7.9 วินาที (n=24 บน `start:console` build จริง flag ปิด; `70-latency-start-console.txt`) · เครื่อง Owner (ไทย) ถึง pooler eu-central-1: ต่อครั้งแรก 1,565 ms, คำสั่งถัดไป 190 ms, ธุรกรรม begin+set+select+commit 762 ms ประมาณ 41 คำสั่งต่อข้อความ (ประมาณจากการหาร **UNVERIFIED** ยังไม่ได้นับ) ค่านี้สะท้อนระยะทาง ไม่ใช่ความเร็วบนโฮสต์จริง · ความเข้าใจเดิมว่าช้าเพราะ dev mode **ผิด**
- **ด่าน answerability แบบ extractive กันคำถามก่อนถึงโมเดล:** 12 จาก 19 คำถามถูกส่งพนักงานโดยไม่ถึงโมเดล รวม warranty ไทยปนอังกฤษและราคาสองสินค้าที่มีคำตอบในเอกสาร (`60-compare-extractive.txt`, `60-compare-model.txt`)
- **extractive แสดงคำสั่งที่ซ่อนในเอกสารให้ลูกค้าเห็นตรง ๆ:** โมเดลตัดคำสั่งนั้นทิ้ง (HANDOFF 17:40; เทียบใน `60-compare-*.txt`)

## 9. เส้นโมเดล (ปิดเป็นค่าเริ่มต้น)

ตัวแปรชุด `AICP_MODEL_*` (ชื่อเท่านั้น; อ่านโดย `platform/composition/model-path.ts`, ตัวอย่างใน `.env.example`): `AICP_MODEL_ANSWERS_ENABLED` (ต้องเป็น `true` เป๊ะ ไม่งั้นเส้นโมเดลปิด), `AICP_MODEL_PROVIDER_ID`, `AICP_MODEL_BASE_URL` (https หรือ loopback http คู่กับ `AICP_MODEL_ALLOW_LOCAL_HTTP=true`), `AICP_MODEL_NAME`, `AICP_MODEL_API_KEY`, `AICP_MODEL_PRICE_INPUT_PER_MTOK`, `AICP_MODEL_PRICE_OUTPUT_PER_MTOK`, `AICP_MODEL_DAILY_MAX_CALLS`, `AICP_MODEL_DAILY_BUDGET` (เว้นได้เมื่อราคาทั้งสองเป็น `0`), และเลือกได้ `AICP_MODEL_MAX_COMPLETION_TOKENS`, `AICP_MODEL_TIMEOUT_MS`

**เปิด/ปิด flag บนโปรเจกต์ทดสอบ:** ตัวห่อ `with-aicp-test-env.mjs` ตั้ง `AICP_MODEL_ANSWERS_ENABLED=false` เสมอ และเปิดเฉพาะเมื่อนำหน้าคำสั่งด้วย `AICP_TEST_MODEL=on` (เพดานรายวันต่อร้านปรับด้วย `AICP_TEST_MODEL_MAX_CALLS` ค่าเริ่มต้น 200) เช่น `AICP_TEST_MODEL=on node with-aicp-test-env.mjs bash -c 'npm run start:console'` · ไม่ใส่ = ปิด ตอนจบรอบ flag ปิด

**ผลที่เกิดจริงครั้งเดียว** (ข้อมูลสังเคราะห์ 19 คำถาม, provider ทดสอบเดียว, ไม่ระบุคีย์; `60-compare-extractive.txt`, `60-compare-model.txt`, `61-ledger-model.txt`, `62-ceiling-fallback.txt`):

- เรียกโมเดลจริง 7 ครั้ง ledger `aicp.model_usage` เป็น `settled` 7 แถว input 1,335 output 693 รวม 2,028 token ค่าใช้จ่ายประเมิน 0 (ราคาตั้ง 0 ตามแผนเหมา)
- แหล่งอ้างอิงครบทุกคำตอบ · นอกข้อมูลขอโทษเหมือน extractive · ข้อมูล internal และร้านอื่นไม่รั่ว · คำสั่งที่ซ่อนในเอกสารโมเดลตัดทิ้ง
- โมเดลถูกเรียกเฉพาะคำถามที่ด่าน extractive ผ่าน จึงตอบครอบคลุมเท่าเดิม (12 จาก 19 ส่งพนักงาน) · โมเดลเพิ่มเวลาประมาณ 3-4 วินาทีต่อคำตอบ (extractive ประมาณ 8.4 วินาที, โมเดลประมาณ 11.0-13.5 วินาที)
- ตั้งเพดาน `AICP_TEST_MODEL_MAX_CALLS=7` หลังใช้ครบ 7 ครั้ง: คำตอบถัดไปตกกลับ extractive ด้วย log `model_path.fallback_extractive` เหตุผล `DAILY_CALL_LIMIT` และ ledger ไม่เพิ่มแถว
- คุณภาพ ค่าใช้จ่ายจริง และเพดานต่อ token **ยังไม่ได้พิสูจน์** นอกชุดนี้
- ทดสอบหลายคีย์ (`90-ollama-keys-each.txt`, `91-ollama-keys-burst.txt`): คีย์ทดสอบ 4 อันและคีย์เดิมตอบ 200 · ยิง 40 ครั้งพร้อมกันคีย์เดียวผ่าน 13-15 ครั้ง ที่เหลือ 429 `too many concurrent requests` · กระจาย 4 คีย์ คีย์ละ 10 พร้อมกันผ่าน 14-16 ครั้ง แปลว่าเพดานจำนวนพร้อมกันอยู่ระดับบัญชี ไม่แยกต่อคีย์ · เพิกถอนคีย์หนึ่งแล้วคีย์นั้นได้ 401 คีย์อื่นยัง 200 · โควตารายวันหรือรายสัปดาห์ต่อคีย์ยังไม่ได้ทดสอบ

## 10. หน้าจอพนักงาน `/handoffs` บนเบราว์เซอร์ (2026-11-05)

ผ่าน: เห็นคิว, เปิดอ่าน, รับเรื่อง, ส่งคำตอบแล้วลูกค้าเห็น, ปล่อยคืนแล้วเรื่องออกจากคิวและปุ่มลูกค้ากลับมา (`80-owner-ui-notes.md`) · ส่งคำตอบโดยยังไม่กดรับเรื่องจะรับเรื่องให้อัตโนมัติ ตามโค้ด `platform/composition/handoff-service.ts` · ข้อด้อยที่ยังไม่แก้: แสดงแค่ UUID ไม่มีคำถามหรือเหตุผล, ไม่อัปเดตเอง, ปุ่มรับเรื่องกดซ้ำได้
