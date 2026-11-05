> **อัปเดต 2026-11-03:** Owner ตอบข้อ 5.1 แล้ว (สาย LINE ทำแบบ offline ขนานกับ G1 ได้) และเปลี่ยนเป้า E2E เป็นโปรเจกต์ Supabase ทดสอบแยก ดูรายละเอียดใน `HANDOFF-2026-11-03.md` ข้อ 5.2–5.5 ยังค้างรอคำตอบ

# แผนเตรียมงาน 3 สายพัฒนาคู่กัน (ร่างรอยืนยัน)

วันที่: 2026-11-02 · ตรวจกับ `origin/main` = `7de2649` · ระดับที่อ้างได้สูงสุด **BUILD_PASS** · ยังไม่ได้เขียนโค้ดอะไร

หมายเหตุที่มา: อ่านจาก repo จริง (AGENTS.md, BRIEF.md, plans/, tasks/, architecture/, PR #17–#26) **ยังเข้า vault ไม่ได้** เลยไม่ได้เปิด DECISIONS-REGISTER และ WORKING-MODEL เอง ตัวเลข D-xxxx ที่อ้างมาจากที่ repo กับ project instructions อ้างไว้เท่านั้น

---

## 0. สิ่งที่ตรวจเจอแล้วไม่ตรงกับที่เข้าใจ (ต้องตกลงก่อน)

1. **Roadmap ใน topic ล้าสมัย** PR #22, #23, HOST-004 (#25), HOST-002 (#26) merge เข้า main หมดแล้วเมื่อ 2026-11-02 (#22 16:36, #23 17:07, #25 17:09, #26 17:45 UTC) งานที่เหลือจริงคือ Core Contract v0.1 กับงาน G1 ที่ค้าง
2. **เอกสารสถานะใน repo ยังไม่ตามทัน** `plans/EXECUTION-STATUS.md`, `WORK-QUEUE.md`, `BLOCKERS.md`, `PLAN-G1` ยังเขียนว่า main = `e47bb57` และยังพูดเรื่อง Docker / รอ merge #23 ต้องซิงก์ (docs-only PR)
3. **ยังไม่เคยพิสูจน์บน Supabase จริง** PR #26 ระบุเองว่า migration ไม่เคย apply บน hosted และ PostgREST RPC / `auth.uid()` ใต้ SECURITY DEFINER ไม่เคยรันจริง การ apply ลง `wstera-lab` ต้องมี GO แยกจาก Owner (D-20261025-11) ผมไม่ทำเอง
4. **สาย LINE ชนกับลำดับงานที่ล็อกไว้** D-20261025-09 กำหนด host → Web Chat → durable handoff → G1 acceptance และ `PLAN-G1` ข้อ 7 ระบุ "เปิด G2 (LINE) หลัง G1 accepted เท่านั้น" ส่วน tasks WEBCHAT/HANDOFF/ACCEPT ระบุ LINE นอกขอบเขต ดังนั้น "พัฒนา LINE พร้อมกัน" ทำได้เฉพาะแบบ **ไม่แตะ LINE จริง** (ดูข้อ 3) ถ้าจะให้ทำจริงก่อน G1 ต้องเป็นคำตัดสินใหม่ของ Owner
5. **"AI Customer Platform" ไม่ใช่สายที่ขนานกับสายอื่น** ตาม D-20261025-01 / D-20261102-23 AICP คือแกนเดียว LINE กับ Merchant Brain เป็นชั้นบนแกนนี้ ผมเลยจัดเป็น: สาย A = Core, สาย B = LINE (adapter), สาย C = Merchant Brain (ชั้นผลิตภัณฑ์)
6. **Merchant Brain ยังไม่มีอะไรให้ implement ตรง ๆ** เอกสารเป็น discovery, Stack / Repo layout / Deployment Kit เป็นข้อเสนอ, Core Contract v0.1 ยังไม่ล็อก และ "instance แยกต่อร้าน" ยังไม่เคยทดลองกับโค้ดปัจจุบัน (ที่เป็น workspace + RLS) สาย C จึงเริ่มจากเอกสารสัญญาก่อน ไม่ใช่เขียนโมดูล
7. **กฎร้านจริงขึ้น repo นี้ไม่ได้** repo ยัง public สาย C เก็บของจริงของร้าน (กฎ ข้อมูล) ฝั่ง private/vault เท่านั้น ใน repo มีแค่ schema กับ fixture สังเคราะห์

---

## 1. Core Contract v0.1 คือด่านที่ต้องผ่านก่อนแยกทำคู่กัน

ทำเป็น docs-only PR ก่อน (ไม่มีโค้ด) แล้วให้ Owner ล็อก ขอบเขตที่เสนอ:

| # | Contract | สถานะใน repo | เจ้าของ | ผู้ใช้ |
|---|---|---|---|---|
| 1 | Channel in/out: `InboundMessage`, `ChannelPort`, `ChannelError` + กติกา outbound/outbox | inbound มีแล้ว (`contracts/channels`) outbound/outbox ยังไม่มี | A | B |
| 2 | Tenancy / connection: `TrustedWorkspaceContext`, connection ownership | มีแล้ว แต่ policy `workspace_connections` จำกัด `channel='web'` (M3 ใน #26) ยังไม่มีที่เก็บ LINE channel secret | A (B ขอ) | B |
| 3 | Conversation + handoff events (pause แบบ durable, resume เฉพาะ staff) | มี state machine ในหน่วยความจำ ยังไม่ durable | A (HANDOFF-002) | B |
| 4 | Knowledge: source/version/chunk/approval + **visibility (internal / customer)** | approval มีแล้ว visibility ยังไม่มี | A เป็นเจ้าของ schema, C เสนอ field | A, C |
| 5 | Business Configuration schema (versioned, validate ก่อนบันทึก, กฎร้านเป็น data ไม่ใช่โค้ด) | ไม่มี | C | A (host โหลด) |
| 6 | Answer path: `SupportOrchestrator` + extractive default, model flag ปิด | มีแล้ว | A | B, C |
| 7 | Instance packaging (config ต่อร้าน, env, deploy kit) | ไม่มี | C เสนอ | เลื่อนไปหลัง v0.1 |

กฎของ contract: Core ห้ามมี `if` ที่รู้จักร้านใด ห้ามเชื่อ tenant id จาก client/LLM/เอกสาร ความรู้ที่ไม่ผ่านอนุมัติหรือ visibility ไม่ตรงห้ามถูกอ้าง fail closed

---

## 2. สามสาย

### สาย A — AICP Core (ทำต่อจาก G1)
เจ้าของ path: `platform/modules/*`, `platform/composition`, `platform/apps/merchant-console`, `platform/apps/web-chat`, `supabase/migrations`

| ขั้น | งาน | เงื่อนไขเริ่ม |
|---|---|---|
| A0 | ซิงก์ docs สถานะ (EXECUTION-STATUS / WORK-QUEUE / BLOCKERS / PLAN-G1) ให้ตรง main | เริ่มได้เลย |
| A1 | E2E บน `wstera-lab` (sign-in → upload → approve → ค้นหา+citation) | **ต้องมี Owner GO apply migration** |
| A2 | WEBCHAT-001 | A0, contract #1–#2 ล็อก (task ระบุ HOST-002 merged แล้ว แต่ต้อง Owner dispatch) |
| A3 | HANDOFF-002 (durable + outbox guard) | A2 merge |
| A4 | G1-ACCEPT-001 | A1–A3 |

### สาย B — LINE (adapter บน Core)
เจ้าของ path: `platform/adapters/channels/line`, `platform/apps/line-webhook` (โฟลเดอร์ว่างตอนนี้) และย้ายของจาก `platform/src/line` ทีหลังด้วย task แยก

| ขั้น | งาน | ทำคู่กับ A ได้ไหม |
|---|---|---|
| B0 | ออกแบบ: ที่เก็บ channel secret, ผูก destination → connection, durable dedupe, reply-token/timeout | ได้ (docs) |
| B1 | adapter + host แบบ offline: signature, normalize, dedupe, ส่งเข้า Core เดียวกับ Web Chat ทดสอบด้วย fake transport ไม่มี LINE OA จริง ไม่มี credential | ได้ **ถ้า Owner อนุมัติ** (ข้อ 0.4) |
| B2 | ต่อ durable handoff / outbox ของจริง | หลัง A3 |
| B3 | LINE sandbox round-trip จริง + duplicate + handoff | หลัง G1 accepted (G2) |

### สาย C — Merchant Brain (ชั้นผลิตภัณฑ์)
เจ้าของ path: `architecture/merchant-brain/`, `platform/contracts/config/` (ใหม่), ส่วน private นอก repo

| ขั้น | งาน | หมายเหตุ |
|---|---|---|
| C0 | ล็อกขอบเขต: ประเภทร้าน/ปัญหาแรก, thin slice แรก (ยังเปิดอยู่ใน Workflow.md) | ต้องการคำตอบจาก Owner |
| C1 | เขียน Business Configuration schema + visibility ใน contract v0.1 | docs |
| C2 | Knowledge lifecycle ส่วนเพิ่ม (candidate → review → publish → revoke, internal vs customer) ต่อยอด `modules/knowledge` แบบ additive | ชนกับ A ที่ไฟล์เดียวกัน ต้องผ่าน contract ก่อน |
| C3 | ทดลอง "instance แยกต่อร้าน" บน repo เดียว: ยืนยันว่าโค้ดปัจจุบันรันได้ทั้งแบบ 1 instance/ร้าน และไม่ปิดทาง SaaS (G3) | ยังไม่เคยทดลอง |
| C4 | Deployment Kit / Backup / Rollback | เลื่อน ยังเป็นแค่ข้อเสนอ |

---

## 3. กันงานชนกัน

- ทุกสายแตก branch จาก `origin/main` ใช้ worktree ใน `.worktrees/<task>/` ตาม AGENTS.md ไม่ self-merge
- **migration มีเจ้าของเดียวคือสาย A** สาย B/C ที่ต้องแก้ schema ส่ง request ผ่าน contract แล้ว A เป็นคนเขียน migration
- โค้ดที่ใช้ร่วม (`modules/knowledge`, `contracts/*`) แก้ได้เฉพาะผ่าน PR ที่อ้าง contract เวอร์ชันที่ล็อกแล้ว
- ทุก PR: เทสต์สด, security impact, cost impact, ระดับไม่เกิน BUILD_PASS

## 4. ลำดับเวลา (เชิงลำดับ ไม่ใส่วันที่เพราะยังไม่มีเกณฑ์วัด)

1. **Phase 0 (ตอนนี้):** A0 ซิงก์ docs + Owner ตอบข้อตัดสินใจด้านล่าง
2. **Phase 1:** เขียน Core Contract v0.1 (docs-only) → Owner ล็อก ระหว่างนี้ A1 รอ GO, B0 กับ C0–C1 เริ่มได้
3. **Phase 2 (ขนานจริง):** A2→A3, B1, C2–C3 บน path ที่แยกกัน
4. **Phase 3:** A4 G1 acceptance → ค่อยเปิด B2–B3 (G2)

## 5. คำถามที่ต้องการคำตอบ

1. **(สำคัญสุด)** อนุมัติให้สาย B ทำแบบ offline-only (B0–B1) ขนานไปกับ G1 หรือไม่ หรือรอ G1 accepted ก่อนตามที่ล็อกไว้
2. Owner GO ให้ apply migration ลง `wstera-lab` ตอนไหน (ผมไม่ apply เอง)
3. Contract v0.1 ใส่ visibility (internal/customer) กับ Business Configuration schema เลยไหม (แนะนำให้ใส่)
4. instance แยกต่อร้านยังคง `workspace_id` ไว้ในโค้ดตามเดิมไหม (แนะนำให้คง เพื่อไม่ปิดทาง SaaS)
5. ร้านประเภทไหน / ปัญหาแรกของ Merchant Brain คืออะไร (C0) ถ้า KMO ก็ใช้เป็นสนามทดลองได้ แต่กฎร้านอยู่ private ไม่ขึ้น repo
