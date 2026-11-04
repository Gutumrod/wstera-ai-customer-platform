# REPORT-WEBCHAT-001 ก้อน 1 — Knowledge Visibility / Audience (AICP Core)

ระดับ readiness สูงสุดที่อ้างได้ = **BUILD_PASS** (ทดสอบบน PGlite + tsc/Next build เท่านั้น ไม่ได้ต่อ Supabase จริง)

สาขา: `opencode/aicp-webchat-core-20261104` (base `main` @ `5ec0518`) · worktree `webchat-core-20261104`
ขอบเขต: CORE-CONTRACT v0.1 §3.4/§3.6 — เพิ่ม `visibility` ต่อ version และ `audience` ของผู้ถามใน AICP core

## 1. สิ่งที่ทำ

- **Migration ใหม่** `supabase/migrations/20261104000100_knowledge_visibility.sql`
  - `aicp.knowledge_versions.visibility text NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','customer'))`
  - trigger `knowledge_version_visibility_guard` + ฟังก์ชัน `aicp.protect_knowledge_version_visibility()` ปฏิเสธการเปลี่ยนค่า (SQLSTATE 23514, ข้อความ `visibility is immutable`)
  - `GRANT INSERT (visibility)` ให้ `knowledge_runtime` และ `REVOKE UPDATE (visibility)` (ไม่มี UPDATE เลย)
  - rollback เขียนเป็น comment ด้านบนไฟล์ · ไม่แตะ migration เดิม · ไม่แตะ schema `public`
- **Contracts** `platform/contracts/data/knowledge.ts`
  - `KnowledgeVisibility = "internal" | "customer"` · `KnowledgeAudience = "customer" | "staff"`
  - `KnowledgeVersion.visibility` (required) · `KnowledgeVersionDraft.visibility?` (optional, ไม่ระบุ = `internal`)
  - `KnowledgeRetrievalQuery.audience` (required ใน type แต่ runtime ที่หาย/ผิดค่า → `customer`)
  - `isCurrentCitation` / `areCurrentCitations` / `listRetrievableChunks` รับ `audience` · `Pick` ของ version เพิ่ม `visibility`
- **Module** `platform/modules/knowledge/index.ts`
  - `resolveKnowledgeVisibility` (ไม่ระบุ = internal, ค่าอื่น = `INVALID_KNOWLEDGE_INPUT`) · `resolveKnowledgeAudience` (เฉพาะ `"staff"` เท่านั้นที่ได้ staff, นอกนั้น customer — ไม่ throw)
  - `createFaqVersion`, `createImportedKnowledgeVersion`, `canonicalizeKnowledgeVersionDraft` ส่ง `visibility` ต่อ ไม่ทิ้ง
  - `retrieveKnowledge` รับ key `audience` ได้, resolve ก่อนเรียก adapter, และกรองซ้ำที่ core: `audience !== "staff" && version.visibility !== "customer"` → ตัดทิ้ง (fail closed แม้ adapter คืนเกิน)
  - `areKnowledgeCitationsCurrent` ส่ง audience ต่อให้ repository
- **Postgres adapter** `platform/adapters/persistence/postgres/knowledge-repository.ts`
  - เพิ่ม `visibility` ใน `VersionRow`, `RetrievableRow`, `mapVersion`, ทุก SELECT/RETURNING, INSERT
  - `snapshotVersionDraft` รับ 8/9/10 key, ตรวจค่าที่ไม่รู้จัก, ไม่ระบุ → internal, ส่งเข้า canonicalize
  - `sameDraft` เทียบ visibility (draft ซ้ำแต่ visibility ต่าง = `VERSION_CONFLICT`)
  - SQL กรองทั้งสองเส้นทาง: `($n::text = 'staff' OR version.visibility = 'customer')` ใน `listRetrievableChunks` และ `isCurrentCitationIn`
- **In-memory repository** `platform/modules/knowledge/testing/in-memory-repository.ts` — เก็บ/กรอง visibility และเช็ค citation ตาม audience (ใช้ในเทสต์และ evaluation)
- **Orchestrator** `platform/modules/ai-engine/support-orchestrator.ts` — `respond` รับ `audience`, resolve แบบ fail closed, ส่งต่อทั้ง `retrieval.search` และ `evidenceFreshness.areCurrentAndApproved`
- **Merchant console search** `platform/apps/merchant-console/lib/knowledge-routes.ts` — ค้นหาและ revalidate citation ด้วย `audience: "staff"` (เจ้าหน้าที่เห็นทั้ง internal และ customer)

## 2. Breaking deltas (ต้องรู้ก่อน merge / ก้อน 2)

1. `KnowledgeRetrievalQuery.audience` เป็น **required ใน type** ทุก call site ต้องระบุ; ที่ไม่ระบุตอน runtime จะถูกตีเป็น `customer` ไม่ throw
2. `KnowledgeRepositoryPort.listRetrievableChunks(workspace, shortlist, audience)` — audience เป็นพารามิเตอร์บังคับตัวสุดท้าย และ `shortlist` ต้องส่ง `undefined` เมื่อไม่ใช้ (เลี่ยง required-after-optional)
3. `isCurrentCitation` / `areCurrentCitations` รับ `audience` เพิ่ม
4. `KnowledgeVersion.visibility` เป็น required (อ่านได้ทุกที่); draft ยัง optional
5. `EvidenceFreshnessPort.areCurrentAndApproved` และ `SupportOrchestrator.respond` มี `audience`

ทางเลือกที่ตัดสินใจ: เก็บ visibility **ระดับ version** (ไม่ใช่ chunk/source) — ปลอดภัยและง่ายที่สุด; ถ้า Owner ต้องการระดับอื่นต้องแก้ก่อน merge

## 3. ไฟล์ที่เปลี่ยน

ใหม่
- `supabase/migrations/20261104000100_knowledge_visibility.sql`
- `platform/modules/knowledge/knowledge-visibility.test.ts`
- `platform/adapters/persistence/postgres/knowledge-visibility.test.ts`

แก้
- `platform/contracts/data/knowledge.ts`
- `platform/modules/knowledge/index.ts`
- `platform/modules/knowledge/testing/in-memory-repository.ts`
- `platform/adapters/persistence/postgres/knowledge-repository.ts`
- `platform/modules/ai-engine/support-orchestrator.ts`
- `platform/apps/merchant-console/lib/knowledge-routes.ts`
- `platform/modules/knowledge/knowledge.test.ts`
- `platform/modules/ai-engine/support-orchestrator.test.ts`
- `platform/composition/knowledge-intake.test.ts`
- `platform/adapters/persistence/postgres/knowledge-repository.test.ts`
- `platform/modules/knowledge/evaluation/synthetic-baseline.ts`
- `package.json` (ต่อท้ายรายการ test 2 ไฟล์ในบรรทัดเดียว)

## 4. เทสต์ใหม่

`platform/modules/knowledge/knowledge-visibility.test.ts` (8 tests)
- adapter ที่คืนทุกแถว (จำลองการกรองพลาด) → ลูกค้าต้องไม่ได้ internal; คำถามที่ไม่มี `audience` ต้องไม่ leaks
- audience หาย/ค่าแปลก (`"admin"`, `"public"`, `42`, `null`, object) → customer; คำถามลูกค้าปกติยังตอบได้
- staff เห็นทั้ง internal+customer, customer เห็นเฉพาะ customer (ทั้ง retrieval และ `listRetrievableChunks`)
- version ที่ไม่ระบุ visibility = internal และไม่ปรากฏต่อลูกค้า
- version ที่ระบุ `customer` ค้นหาเจอ
- citation freshness: citation internal ใช้กับ customer = false, staff = true, ข้าม workspace = false
- `canonicalizeKnowledgeVersionDraft` ไม่ทิ้ง visibility
- orchestrator ส่ง audience ไปทั้ง retrieval และ freshness; หาย/ผิดค่า → `"customer"` (ไม่ใช่ `undefined`)

`platform/adapters/persistence/postgres/knowledge-visibility.test.ts` (PGlite, 4 tests + 2 subtests)
- SQL กรอง visibility ทั้งเส้นทางปกติและ shortlist; core ซ้ำอีกชั้น
- citation freshness ตาม audience + cross-workspace denial
- version ที่ไม่ระบุ visibility ถูกเก็บเป็น internal
- UPDATE visibility ถูกปฏิเสธ: runtime role ได้ 42501, elevated writer ติด trigger 23514

## 5. เทสต์เดิมที่แก้ (ไม่ได้ลด assertion)

| ไฟล์ | สิ่งที่แก้ | เหตุผล |
|---|---|---|
| `platform/adapters/persistence/postgres/knowledge-repository.test.ts` | harness โหลด migration ใหม่; เติม `"staff"` ใน `listRetrievableChunks` (9), `isCurrentCitation` (8), `areCurrentCitations` (5), `retrieveKnowledge` (1) | signature บังคับ audience; fixture เดิมเป็นเอกสาร internal จึงใช้ staff เพื่อคงพฤติกรรมเดิม |
| `platform/modules/knowledge/knowledge.test.ts` | เติม `audience: "staff"` ใน `retrieveKnowledge` 29 จุด และ `areKnowledgeCitationsCurrent` 7 จุด; fake เรียงกลับส่ง audience ต่อ | signature บังคับ; fixture เดิม default internal |
| `platform/modules/ai-engine/support-orchestrator.test.ts` | เติม `audience: "customer"` ใน `respond` 30 จุด; freshness fake รับพารามิเตอร์ที่ 3 (ไม่ใช้ค่า) | type บังคับ; fake เดิมไม่กรอง visibility |
| `platform/composition/knowledge-intake.test.ts` | เติม `audience: "staff"` 2 จุด | intake สร้างเอกสาร default internal |
| `platform/modules/knowledge/evaluation/synthetic-baseline.ts` | เอกสาร synthetic ทั้งหมดระบุ `visibility: "customer"` และค้นหาด้วย `audience: "customer"` | คงผลลัพธ์ baseline เดิม (corpus ถูก lock ไว้) ขณะทำให้เส้นทาง realistic |

ไม่มีการลด/ลบ assertion เดิม; ไม่แตะ `platform/apps/web-chat/**` หรือ `platform/composition/web-chat*`; ไม่แตะ `001-knowledge.sql` และ `workspace-host-migration.test.ts`

## 6. หลักฐานก่อนแก้ (raw)

คำสั่ง: `npm run build` (โค้ดเก่า + เทสต์ใหม่) แล้ว `node --test dist/modules/knowledge/knowledge-visibility.test.js dist/adapters/persistence/postgres/knowledge-visibility.test.js` → exit 1, **3 pass / 11 fail**

```
✖ PostgreSQL retrieval filters visibility in SQL for customer and staff audiences
  AssertionError [ERR_ASSERTION]: SQL must not return an internal version to a customer audience
      actual: [ 'customer-faq', 'internal-faq' ]
    expected: [ 'customer-faq' ]
...
✖ PostgreSQL citation freshness honours the audience and keeps cross-workspace denial
  AssertionError: an internal citation must not be reported current for a customer audience
    true !== false
...
✖ customer audience never receives internal knowledge even when the adapter returns every approved row
  AssertionError: an internal chunk must not leak to a customer audience when the adapter over-returns
      actual: { kind: 'evidence', hits: [ { sourceId: 'internal-faq',
                text: 'รหัสลับภายใน INTERNAL-X1' ... } ] }
    expected: { kind: 'no_answer', reason: 'NO_APPROVED_EVIDENCE' }
...
ℹ tests 14
ℹ pass 3
ℹ fail 11
```

## 7. หลักฐานหลังแก้ (raw)

เทสต์ใหม่ (คำสั่งเดียวกับก่อนแก้) → exit 0

```
✔ PostgreSQL retrieval filters visibility in SQL for customer and staff audiences
✔ PostgreSQL citation freshness honours the audience and keeps cross-workspace denial
✔ PostgreSQL persists a version with no explicit visibility as internal
✔ PostgreSQL refuses every UPDATE of visibility
✔ customer audience never receives internal knowledge even when the adapter returns every approved row
✔ missing or unrecognised audience fails closed to customer
✔ staff audience sees internal and customer versions while customer sees only customer versions
✔ a version created without an explicit visibility defaults to internal
✔ an explicitly customer-visible version is retrievable by a customer
✔ citation freshness rejects an internal citation for a customer audience
✔ canonicalizing a draft preserves its visibility instead of silently dropping it
✔ support orchestrator forwards the trusted audience to retrieval and freshness and defaults to customer
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

`npm run check` (typecheck + test ทั้งหมด + Next build) → exit 0

```
ℹ tests 240
ℹ pass 240
ℹ fail 0
✓ Compiled successfully in 992ms
  Finished TypeScript in 1246ms ...
```

`git diff --check` → exit 0 (ไม่มี whitespace error)

## 8. ยังไม่ทำ / ข้อจำกัด (พร้อมเหตุผล)

- **ยังไม่ต่อ Supabase จริง** — ไม่มี credential/การ migrate production; ทุกอย่างพิสูจน์บน PGlite + host migration harness เท่านั้น
- **ยังไม่ผูก visibility เข้ากับ intake upload** — `prepareKnowledgeDocumentVersion`/`ingestKnowledgeVersion` ยังไม่รับ visibility (สโคปก้อน 1 ระบุเฉพาะ createFaqVersion, canonicalize, snapshotVersionDraft, createVersion) ผลคือเอกสารที่อัปโหลดผ่าน intake ตอนนี้เป็น internal ทั้งหมด → ต้องมี follow-up ก่อนเปิดให้ merchant เลือก "ลูกค้าเห็นได้" ตอนอัปโหลด
- **merchant console ยังไม่แสดง visibility ใน UI/versionSummary** — ไม่อยู่ในสโคปและจะกระทบ response shape ของ route tests; เสนอเป็นงานถัดไป
- **ไม่มี UI/web-chat ฝั่งลูกค้า** — `platform/apps/web-chat/**` ถูกห้ามแตะตามคำสั่ง
- **ไม่ push / ไม่เปิด PR / ไม่ merge / ไม่เรียก reviewer** ตามคำสั่ง

DONE
