# รายงาน HOST-002

## สรุป

ปิดรอยรั่วของ authenticated host ตาม `tasks/TASK-HOST-002-HOST-HARDENING.md` ไม่มี product surface ใหม่ · ระดับที่อ้างได้สูงสุด **BUILD_PASS** · อ้างอิง D-20261025-08, -09, -11, D-20261103-01

- **M1 ปิดในโค้ด:** อนุมัติผ่าน `aicp.approve_knowledge_version` ใต้ `authenticated` ผู้อนุมัติมาจาก `auth.uid()` ตรวจ owner ใน SQL ถอน `UPDATE (approved_at, approved_by)` จาก `knowledge_runtime`
- **M2 ปิดในโค้ด:** shortlist และ `LIMIT 2000` ฝั่ง SQL แถวไม่พก `version.content` · PDF worker สูงสุด 2 คิว 8 เกินตอบ 503 ไม่บันทึก quarantine · rate limit ต่อ user upload 20/นาที search 60/นาที ตอบ 429 พร้อม `Retry-After` ก่อนอ่าน body
- **M3 ปิดในโค้ด:** policy `workspace_connections` จำกัด `channel = 'web'`
- **Membership revalidation:** ทุก write ของ repository และ audit เรียก `aicp.assert_active_knowledge_writer` ในทรานแซกชันเดียวกันพร้อม `FOR SHARE` · `TrustedWorkspaceContext` ไม่เปลี่ยน
- **Route tests:** ทุก route ครอบ unauthenticated, cross-workspace, oversized, malformed, content type, unknown fields, quarantine ตรวจ status, code และไม่มีแถวหรือ object ถูกเขียน

## Low

| ข้อ | สถานะ |
|---|---|
| `putOriginal` เทียบ `removeOriginal` | รวมเป็นกฎเดียว ของเดิมกันอยู่แล้ว ไม่ใช่รูจริง |
| quarantine object ค้างเมื่อ replay | แก้ ลบ object ใหม่เมื่อ record อ้าง path เดิม เช่น replay คนละ kind |
| แยก error ด้วย substring | แก้ ใช้ตารางรหัสและชุดชื่อ conflict และเลิกส่งต่อ error ของ vendor ที่มี status/code |
| GET ไม่มี origin check | แก้ ใช้ Origin หรือ `Sec-Fetch-Site` เพราะ same-origin GET ไม่ส่ง Origin |
| `"::1"` เทียบ `[::1]` | แก้ที่ `scripts/seed-environment.mjs` จุดอื่นถูกอยู่แล้ว |
| web connection ซ้ำ | แก้ด้วย unique index เฉพาะ active |
| `postgres:postgres` ใน `.env.example` | คงค่า (ค่า local ของ Supabase CLI) ใส่ comment กำกับ |

ถ้อยคำ: แก้ `README.md` เรื่อง CA และ `architecture/SOURCE-IMPORT-PROVENANCE.md` เรื่องร้านนำร่องพร้อมลบ path เครื่อง · `reports/host-004-2026-11-02/REPORT.md` ไม่มีข้อความเดียวกัน จึงไม่แตะ

## ไฟล์ที่แตะ

- migration ใหม่: `supabase/migrations/20261103000100_host_hardening.sql`
- host: `platform/apps/merchant-console/lib/{knowledge-routes,rate-limit,http,host}.ts`, `app/api/knowledge/**/route.ts`
- adapter: `platform/adapters/persistence/supabase/knowledge-approval.ts`, `postgres/knowledge-repository.ts`, `postgres/knowledge-intake-audit.ts`, `storage/supabase/private-knowledge-storage.ts`, `knowledge/document-extractor.ts`
- core: `platform/composition/{knowledge-intake,merchant-knowledge-host}.ts`, `platform/contracts/data/knowledge.ts`, `platform/modules/knowledge/index.ts`
- เทสต์: `platform/composition/merchant-knowledge-routes.test.ts`, `platform/composition/testing/merchant-host-harness.ts`, `platform/adapters/persistence/supabase/host-hardening-migration.test.ts`, `platform/adapters/knowledge/document-extractor.test.ts` และเทสต์เดิมบางไฟล์
- อื่น ๆ: `package.json` (รายการเทสต์), `tsconfig.json` (`DOM.Iterable`, นอกขอบเขตแต่จำเป็น), `scripts/seed-environment.mjs`, `.env.example`, `README.md`, `architecture/SOURCE-IMPORT-PROVENANCE.md`, `reports/host-002-2026-11-03/`

## ผลเทสต์สด

| รอบ | สถานะโค้ด | tests | pass | fail |
|---|---|---|---|---|
| ฐาน | `acb0e9e` | 184 | 184 | 0 |
| ก่อนแก้ | `acb0e9e` + seam ที่ไม่เปลี่ยนพฤติกรรม + เทสต์ใหม่ | 215 | 192 | 23 |
| หลังแก้ | `250bb67` | 216 | 216 | 0 |

- `npm run check` exit 0 รวม typecheck และ `next build` · `git diff --check` ผ่าน · รันด้วย PGlite และค่าสังเคราะห์
- CI: run `41492787506` บน `250bb67` = success · run `41488468918` บนฐาน `acb0e9e` = success
- route เดิม import ใน node ไม่ได้ จึงย้าย logic ไป `lib/knowledge-routes.ts` ก่อน โดยเทสต์เดิม 184 ตัวยังผ่าน แล้วจึงใส่เทสต์ใหม่
- เทสต์ใหม่ที่ผ่านตั้งแต่ก่อนแก้เป็นตัวล็อกพฤติกรรม ไม่ใช่หลักฐานของการแก้: 401 ทุก route, origin ของ POST, input เสีย, quarantine, owner-only approve, search ข้าม workspace, replay ที่ใช้ object เดิม
- "upload and delete enforce the same workspace path rule" ล้มก่อนแก้เพียงเพราะเทสต์คาดชื่อ error ใหม่ที่ภายหลังไม่ใช้ **ไม่นับเป็นหลักฐานว่าเคยมีรู**
- log ดิบแทน path เครื่องด้วย `<worktree>` และตัดช่องว่างท้ายบรรทัด เนื้อหาอื่นไม่เปลี่ยน

## Precheck

`precheck.mjs` exit 0 (TAKEOVER-2026-11-03-R1) · Haiku PASS · Qwen FAIL · `PAIR FAIL` ไม่ยิงซ้ำ ตอบ RULE-7B รอบเดียว:

1. `knowledge-routes.ts` จะไม่ถูก compile เพราะ `tsconfig.json:16` → หักล้าง: exclude กรองแค่ glob ไฟล์ที่ถูก import ยัง compile ดู `dist/apps/merchant-console/lib/supabase/admin.js`
2. `server-only` ไม่มี เสี่ยง typecheck แดง → หักล้าง: tsc ไม่ resolve side-effect import และ `npm test` ที่ฐานผ่าน 184/184
3. limiter ไม่มีเพดานและ seam → ในขอบเขต แก้แล้ว: มีค่าเริ่มต้นและ `createKnowledgeRoutes` รับ limits
4. คลุมเครือเรื่องลบ `repository.approveVersion` → เก็บไว้ ใต้ migration จริงล้ม 42501 มีเทสต์ยืนยัน
5. ข้ออ้าง `FOR SHARE` ต้องมีสิทธิ์ UPDATE → ยืนยันบน PGlite: SELECT อย่างเดียวได้ 42501

เหลือข้อในขอบเขต 0 ข้อ

## ผลกระทบความปลอดภัย

- คนถือ credential ของ `knowledge_runtime` อนุมัติเองไม่ได้ ต้องมี JWT ของ owner
- membership ที่ถูกเพิกถอนหลัง resolve identity เขียนไม่ได้ · runtime อ่าน memberships ตรงไม่ได้
- สมาชิกไม่เห็น LINE connection · GET ปฏิเสธการอ่านข้าม site
- สแกน diff ไม่พบรูปแบบคีย์, JWT, private key หรือ project ref จริง

## การตัดสินใจที่ขอให้ผู้ตรวจดู

1. **เบี่ยงจาก task:** ใช้ SECURITY DEFINER แทน `GRANT SELECT ON aicp.workspace_memberships` เพราะ grant เฉย ๆ เห็น 0 แถวจาก RLS, ต้องเพิ่ม policy และล็อก `FOR SHARE` ไม่ได้
2. `revoked_*` ยังอยู่กับ `knowledge_runtime`: ไม่ข้ามด่านอนุมัติ แต่คนถือ credential ยังถอนความรู้ได้ ยังไม่มี route ใช้
3. route test ทดสอบ `lib/knowledge-routes.ts` ส่วน `route.ts` เหลือแค่ wiring ตรวจได้จาก `next build` เท่านั้น
4. `listRetrievableChunks` คืน `version` แบบย่อ จึงแก้ assertion เดิม 2 จุดใน `knowledge-repository.test.ts`
5. คำค้นเกิน 64 term ส่งเฉพาะ term ยาวสุด และ candidate เกิน 2,000 แถวถูกตัด ผลอันดับต่ำอาจหาย

## ค่าใช้จ่าย

ไม่มี ไม่เพิ่ม dependency ไม่เรียกบริการจริง ไม่ apply migration

## ข้อที่ยังค้าง / ยังไม่พิสูจน์

- ไม่เคยรันกับ Supabase จริง: PostgREST RPC, `AC001` ผ่าน HTTP, `auth.uid()` ใต้ definer (ขึ้นกับผลอ่าน LAB เรื่อง `GRANT USAGE ON SCHEMA auth`)
- migration ไม่เคย apply บน hosted: `DROP POLICY` และ `CREATE INDEX` บนตารางของ `aicp_migrator` ต้องการเงื่อนไขเดียวกับ `ALTER ... OWNER` เดิมซึ่งยังไม่เคยรันจริง
- race จริงระหว่าง revoke กับ write: PGlite มี connection เดียว พิสูจน์แค่ลำดับต่อกันและการมี `FOR SHARE`
- `Sec-Fetch-Site` จากเบราว์เซอร์จริง, `getClaims` จริง และ `requireKnowledgeHost` ไม่ถูกรันในเทสต์ (session ตั้งตรง, storage ปลอม)
- ตัวเลขเพดานทั้งหมดเป็นค่าตั้งต้น ไม่ได้มาจากการวัด · rate limit และเพดาน worker รีเซ็ตต่อ process และคูณตาม instance
- ยังไม่แก้สถานะใน `tasks/` และ `plans/` · apply ลง LAB ต้องมี GO แยก · ยังไม่ผ่านการตรวจอิสระ · ห้าม merge จนกว่า Owner สั่ง

DONE
