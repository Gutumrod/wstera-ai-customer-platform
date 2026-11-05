# REPORT-HOST-002-FIX

ระดับ readiness สูงสุดที่อ้างได้ = BUILD_PASS (รันบน PGlite เท่านั้น ไม่มีการต่อ Supabase จริง)

## F1 — knowledge_runtime เพิกถอน/archive/ปลอม revoked_by ได้
- migration ใหม่ `supabase/migrations/20261103000200_host_hardening_revoke.sql`: ฟังก์ชัน `aicp.revoke_knowledge_version(ws, source, version, reason)` และ `aicp.archive_knowledge_source(ws, source)` เป็น SECURITY DEFINER, `SET search_path = pg_catalog, aicp`, เจ้าของ `aicp_migrator`, REVOKE FROM PUBLIC, EXECUTE เฉพาะ `authenticated`, actor จาก `auth.uid()`, ตรวจ owner ใน SQL, รหัส error แบบเดียวกับ approve
- `REVOKE UPDATE (revoked_at, revoked_by, revocation_reason)` บน knowledge_versions และ `REVOKE UPDATE (status)` บน knowledge_sources จาก knowledge_runtime
- ตามคำสั่ง controller ข้อ 11: `GRANT UPDATE (created_at)` บน knowledge_sources เพียงคอลัมน์เดียว เพื่อให้ `SELECT ... FOR UPDATE` (knowledge-repository.ts:404/:454/:567) ทำงานต่อ (Postgres ต้องมีสิทธิ์ UPDATE อย่างน้อย 1 คอลัมน์) + trigger `knowledge_source_identity_guard` (function pin search_path) ปฏิเสธ 23514 ถ้า workspace_id, source_id, kind, title, created_at เปลี่ยนค่า การ set created_at เป็นค่าเดิมอนุญาต (ไม่เปลี่ยนอะไร)
- TypeScript: `platform/adapters/persistence/supabase/knowledge-revocation.ts` (port `KnowledgeRevocationPort` + `SupabaseKnowledgeRevocation` ข้างๆ adapter ไม่แตะ contracts) ใช้ RPC และ mapping error แบบเดียวกับ knowledge-approval.ts
- ไม่มี route เรียก revoke/archive (grep แล้ว) ไม่เพิ่ม route · `PostgresKnowledgeRepository.revokeVersion/archiveSource` คงเดิม แต่ล้มที่ฐานข้อมูลภายใต้ runtime role (SQLSTATE 42501)
- **สิทธิ์ที่เหลือบน knowledge_runtime**: knowledge_versions: UPDATE (status) (ingest transitions; flip เป็น revoked ตรง ๆ ติด CHECK เพราะ revoked_* ตั้งไม่ได้ ทดสอบแล้ว 23514), approved_at/approved_by ถูกถอนไปแล้วใน 20261103000100; knowledge_sources: UPDATE (created_at) เท่านั้น (lock handle)
- ข้อสังเกตเพื่อตัดสินใจต่อ: 42501 ถูก map เป็น `CROSS_WORKSPACE_ACCESS_DENIED` (knowledge-repository.ts mapDatabaseError) ซึ่งทำให้เข้าใจผิดเมื่อ runtime role ถูกปฏิเสธ revoke/archive — ไม่ได้แก้ตามคำสั่ง

## F2 — assertActiveWriter ข้ามเมื่อไม่มี actor
- `knowledge-repository.ts`: actor เป็น required (`KnowledgeWriterActor = string | typeof NO_ACTOR_FOR_SCHEMA_TESTS`), actor ว่าง/ไม่ใช่ string = `MEMBERSHIP_REQUIRED` (fail closed) · `NO_ACTOR_FOR_SCHEMA_TESTS` เป็น symbol ที่ test เท่านั้นใช้; `merchant-knowledge-host.ts` ไม่แก้และส่ง actor เสมอ (มี test ยืนยัน)
- `knowledge-intake-audit.ts` ใช้กฎเดียวกัน
- บรรทัดที่แก้เพื่อส่ง opt-out เท่านั้น (assertion ไม่เปลี่ยน): postgres/knowledge-repository.test.ts :53, :144, :289 (+import); supabase/workspace-host-migration.test.ts :153 (+import)

## F6 — approve ตอบ error หลัง commit
- `knowledge-routes.ts` approveVersion: read-back ล้มหรือไม่พบ -> 200 `{ data: { sourceId, versionId, status: "approved" } }` + no-store

## F5 — unique index ล้มทั้ง migration เมื่อมีข้อมูลซ้ำ
- `scripts/check-web-connection-duplicates.sql` (SELECT อย่างเดียว) + ประโยคเดียวใน README.md ส่วน hosted migrations (ไม่แก้ migration ที่ merge แล้ว)

## การทดสอบ
- เพิ่ม `platform/adapters/persistence/supabase/host-hardening-revoke.test.ts` (9 test: F1 x6, F2 x3) + F6 ใน merchant-knowledge-routes.test.ts; เพิ่มไฟล์ใน package.json (รายการ test เท่านั้น); harness `authenticatedRpcClient` รองรับ revoke (4 พารามิเตอร์) และ archive
- RED (ก่อนแก้): 224 tests, 218 pass, 6 fail (F1 x4, F2 x1, F6 x1)
- GREEN สุดท้าย: 226 tests, 226 pass, 0 fail · `npm run check` ผ่าน (typecheck + test + build:console) · `git diff --check` ไม่มี error
- assertion เดิมที่เปลี่ยน: host-hardening-migration.test.ts "M1" บรรทัด `repository.archiveSource` ของ runtime role -> เรียก `aicp.archive_knowledge_source` ผ่าน owner (authenticated) path ตามข้อ 3 ไม่มีอันอื่น
- ระหว่างทาง: ลองถอน UPDATE (status) บน sources ทั้งหมดแล้ว ingest พัง (FOR UPDATE ต้องมีสิทธิ์ UPDATE) -> หยุดรายงาน controller -> ได้คำสั่งข้อ 11-13

## UNVERIFIED
- ไม่ได้รันบน Supabase จริง: PostgREST RPC, `auth.uid()` ภายใต้ SECURITY DEFINER และการ expose schema `aicp` ตรวจจากไฟล์/PGlite เท่านั้น
- ยังไม่ได้ push/PR/merge

DONE
