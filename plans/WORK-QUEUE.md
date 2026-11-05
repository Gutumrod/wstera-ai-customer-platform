# Work Queue

Updated: 2026-11-05 (evening) against `main` at `303312c`. ตารางด้านล่างบันทึกเมื่อ 2026-11-02 หัวข้อ "อัปเดต 2026-11-05" ท้ายไฟล์ชนะแถวที่ขัดกัน. Merged code and product acceptance are tracked separately.

## Done on main

- Task 001 foundation/security boundary (PR #2), retained from the initial baseline.
- PR #16 consolidated and merged prior PRs #4–#15 at `857b2e5`; former heads remain preserved in Git ancestry.
- Included slices: Phase 0C tenancy/channel boundary, synthetic knowledge lifecycle and retrieval, bounded local PDF/CSV extraction, retrieval evaluation/SKU normalization, local conversation/handoff core, citation validation, response orchestration, mocked-transport model adapter, and PostgreSQL knowledge persistence with PGlite coverage.
- PR #18 merged the local-only authenticated knowledge host (staff auth, server-resolved workspace, private synthetic PDF/CSV upload, review/approval and citation search). Its browser-to-Supabase E2E remains open.
- PR #19 merged a pure PromptPay payload builder; no real bank-app QR scan or payment wiring.
- PR #20 merged typed business-action contracts and lifecycle reducer; no executor or business writes.
- PR #21 merged source-import provenance and pilot-gate documents.
- PR #24 merged Merchant Brain discovery documents only; no code change.

## Current G1 work

| Work | Current state | Next evidence needed |
|---|---|---|
| Authenticated host/bootstrap | Implemented and merged in PR #18; local-only synthetic scope; Docker withdrawn by `D-20261025-11` | Proposed, not an Owner decision: HOST-004, separate Owner GO and PR #23 merge decision, then authenticated E2E on `wstera-lab`; route-level tests/rate limiting; resolve membership-revalidation race in the write transaction; independent review of remaining delta |
| Knowledge upload and approval | Local-only upload, review/approval and citation search merged | Verify browser-to-`wstera-lab` flow and exact citations; no hosted setup implied |
| Web Chat | No visitor chat UI/session host | Allowed-origin/session binding, shared-engine extractive cited answer (model flag off), citation and abuse-limit tests |
| Durable handoff | Local state/ports only | Persistent staff authorization, durable pause/resume and atomic dispatch/outbox guard |
| Live model and usage | Adapter tested with mocked transport; no provider selected | Owner-approved provider, data region and budget; durable usage ledger and measured answer quality |
| G1 acceptance | No one-shop end-to-end run | Browser trace from upload through grounded answer and authorized human takeover; negative tenant cases and independent security review |
| Business actions | PR #20 contract and pure reducer merged; no executor | Keep P3A planned until separately approved and scoped |
| PromptPay | PR #19 pure payload builder merged; not wired to payments | Real bank-app scan and independent vector evidence before any separately approved wiring task |

G2 real LINE sandbox follows G1. G3 onboarding and G4 commercial validation remain gated. Do not deploy, run hosted migrations, or incur provider spend without separate Owner approval.

## อัปเดต 2026-11-05

ระดับที่อ้างได้สูงสุด: รันครั้งเดียวบนโปรเจกต์ทดสอบด้วยข้อมูลสังเคราะห์ (หลักฐาน `evidence-aicp-20261105/` ใน vault)

| งาน | สถานะ | ถัดไป |
|---|---|---|
| Authenticated host / knowledge upload / approval / search | E2E ระดับ API ผ่านบนโปรเจกต์ทดสอบ (26/26, ซ้ำ 25/26 จากสคริปต์) | Owner ลองฟอร์ม login และ knowledge console บนเบราว์เซอร์ |
| Web Chat | merge แล้ว ลองมือบนหน้าแชตกับฐานทดสอบจริงผ่าน | วัดความเร็วบนโฮสต์จริง (ดู B-06) |
| Durable handoff | merge แล้ว บั๊ก 3 ข้อแก้ใน PR #44 ลองซ้ำผ่าน (`50`, `51`) | Owner ลองหน้า `/handoffs` บนเบราว์เซอร์ |
| Live model และ usage | เส้นโมเดลอยู่ใน main (PR #45) flag ปิดเป็นค่าเริ่มต้น; เรียกโมเดลจริง 7 ครั้งบนข้อมูลสังเคราะห์ ledger และเพดานตกกลับทำงาน | เทสต์ 4 คีย์ provider (รอ Owner สร้างคีย์), ปรับด่าน answerability (B-07) |
| รายการใหม่จากการรัน | region 8 วินาทีต่อข้อความ (B-06), ด่าน answerability (B-07), ไม่มี route revoke (B-08), อัปโหลดเนื้อซ้ำไม่กัน (B-09), extractive แสดงคำสั่งซ่อน (B-10) | Owner จัดลำดับ |
| เก็บกวาดโปรเจกต์ทดสอบ | ยังไม่ทำ; rollback ยังไม่เคยลอง | ลบค่าลับ ปิดโปรเจกต์ หรือใช้ `scripts/e2e-rollback.sql` |
| G1 acceptance | ยังไม่ครบ ไม่มีการตรวจอิสระของหลักฐานชุดนี้ | ตรวจอิสระ + ลองเบราว์เซอร์ที่ค้าง |

ไม่มีการ deploy ไม่มี traffic จริง ไม่มีค่าใช้จ่ายจริง G2 ถึง G4 ยังถูกกั้นด้วย G1
