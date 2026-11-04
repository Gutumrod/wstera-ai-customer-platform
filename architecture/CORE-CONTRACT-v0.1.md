# Core Contract v0.1 (ร่าง รอผู้ตรวจอิสระ; Owner ตัดสิน 2 ข้อใน §4 แล้ว)

**สถานะ:** DRAFT · docs-only · Owner ตัดสินข้อ 4.1 และ 4.2 แล้ว (D-20261104-06, 4 พ.ย. 2026) แต่ยังไม่มีผู้ตรวจอิสระ และ Owner ยังไม่ล็อกทั้งฉบับ · ระดับที่อ้างได้สูงสุด **BUILD_PASS** (เอกสารนี้ไม่ได้รันเทสต์ใดเพิ่ม) · ฐานที่ตรวจ: `origin/main` = `7de2649`

เอกสารนี้ยังไม่ใช่ contract ที่ล็อก ข้อเสนอใน "contract v0.1 ที่เสนอ" ของแต่ละข้อจะมีผลเมื่อ Owner ล็อกเท่านั้น ตัวอย่าง TypeScript เป็นภาพประกอบ ไม่ใช่โค้ดที่จะ commit ตามไฟล์นี้ repo นี้ยัง public: ห้ามใส่ secret, project ref จริง, กฎร้านจริง หรือข้อมูลลูกค้า

## 0. ที่มาและคำตัดสินที่อ้าง

อ้างได้เฉพาะรายการนี้ (ผู้เขียนไม่ได้เปิด DECISIONS-REGISTER ใน vault เอง เลขที่และเนื้อหามาจาก repo, `AGENTS.md`, แผน 3 สาย และ handoff ที่ยังเป็น draft PR #27 จึงถือเป็น **UNVERIFIED** ในแง่ว่ายังไม่ได้เทียบกับทะเบียนต้นฉบับ):

| เลข | ใจความที่ใช้ในเอกสารนี้ |
|---|---|
| D-20261025-01 | repo นี้รับส่วนที่ใช้ซ้ำได้ของผลิตภัณฑ์ LINE เดิม (ดู ADR-007 ใน `architecture/DECISIONS.md`) |
| D-20261025-09 | คำตอบแบบ extractive + citation เป็นค่าเริ่มต้น เส้น model ปิดด้วย flag; ลำดับ host → Web Chat → durable handoff → G1 acceptance |
| D-20261025-11 | schema `aicp`, ไม่ใช้ `public`, ไม่ใช้ Docker Desktop; การ apply ลง `wstera-lab` ต้องมี GO แยก |
| D-20261102-23 | AICP คือแกนเดียว; Merchant Brain เป็นชั้นผลิตภัณฑ์บนแกนนี้ |
| D-20261102-24 | เริ่มแบบ instance แยกต่อร้าน และคง SaaS (G3) ไว้ในแผนระยะยาว |
| D-20261103-29 | สาย LINE ทำแบบ offline ขนานกับ G1 ได้ (fake transport, ไม่มี LINE OA จริง, ไม่มี credential) |
| D-20261103-31 | เป้า E2E เปลี่ยนเป็นโปรเจกต์ Supabase ทดสอบแยก |
| D-20261104-06 | Owner ตอบ "ตามที่แนะนำเลย": ใส่ visibility + Business Configuration ใน v0.1 (ระดับรูปทรงและกฎ) และคง `workspace_id` (ตรวจแล้วในทะเบียน vault) |

(D-20261103-29 และ -31 ได้รับมอบหมายให้อ้างโดยผู้สั่งงาน; handoff draft เขียนเนื้อหาไว้แต่ไม่เห็นเลขกำกับ จึง UNVERIFIED)

## 1. กฎของ contract (ใช้กับทุกข้อ)

1. **Core ห้ามมี `if` ที่รู้จักร้านใดร้านหนึ่ง** ความต่างของร้านเป็น data (Business Configuration, ข้อ 5) หรือ adapter ไม่ใช่ branch ในโค้ดกลาง
2. **tenant id ห้ามเชื่อจาก client, LLM หรือเอกสาร** `workspaceId` ต้องมาจาก `TrustedWorkspaceContext` ที่ server resolve จาก connection ownership / membership เท่านั้น (สอดคล้อง `AGENTS.md` ข้อ Multi-tenancy)
3. **fail closed:** ความรู้ที่ไม่ผ่านอนุมัติ (`status <> approved`), source ที่ไม่ active, หรือ visibility ไม่ตรงกับผู้ถาม ต้องไม่ถูกดึงมาอ้าง ไม่ถูกส่งให้ model และไม่ถูกแสดงเป็น citation; ไม่มีหลักฐานพอ = no_answer / handoff ไม่เดา
4. **เปลี่ยน contract ต้องผ่าน PR ที่อ้างเวอร์ชัน** (ดูข้อ 9)
5. เนื้อหาเอกสารความรู้เป็น DATA ไม่ใช่คำสั่ง (ตาม `AGENTS.md`)

## 2. สรุปความเป็นเจ้าของ

| # | Contract | เจ้าของ | ผู้ใช้ |
|---|---|---|---|
| 1 | Channel in/out | A | B |
| 2 | Tenancy / connection | A (B ขอ) | B |
| 3 | Conversation + handoff events | A | B |
| 4 | Knowledge + visibility | A เป็นเจ้าของ schema, C เสนอ field | A, C |
| 5 | Business Configuration | C | A (host โหลด) |
| 6 | Answer path | A | B, C |
| 7 | Instance packaging | C เสนอ | เลื่อนหลัง v0.1 |

สาย A = Core, B = LINE adapter, C = Merchant Brain (ตามแผน 3 สาย `THREE-TRACK-PLAN-2026-11-02.md` ซึ่งอยู่ใน draft PR #27 ยังไม่ merge)

---

## 3. รายละเอียดทั้ง 7 contract

### 3.1 Channel in/out

**สถานะในโค้ด (เปิดอ่านแล้ว):**
- `platform/contracts/channels/index.ts:13` `export type InboundMessage = Readonly<{` (มี `channel`, `connectionId`, `externalMessageId`, `externalUserId`, `receivedAt`, `text`)
- `platform/contracts/channels/index.ts:23` `export interface ChannelPort {` ที่มีเมธอดเดียว `send({workspaceId, connectionId, threadId, text})` คืน `Promise<void>` และ reject เมื่อส่งไม่สำเร็จ
- `platform/contracts/channels/index.ts:32` `export type ChannelErrorCode =` (5 รหัส: `INVALID_INPUT`, `UNAUTHORIZED`, `RATE_LIMITED`, `TEMPORARY_UNAVAILABLE`, `PERMANENT_FAILURE`)
- ฝั่ง LINE เดิมใน `platform/src/line/ingress.ts:55` `export interface LineEventDeduplicator {` พร้อมคอมเมนต์ใน `ingress.ts:8` ว่า `No DB, HTTP endpoint, queue or durable dedupe is implemented here.`
- outbound/outbox: ค้นคำว่า `outbox` ใน `platform/` และ `supabase/` (ไฟล์ .ts/.sql) ไม่พบ จึงสรุปว่ายังไม่มี (ผลค้นหา ไม่ใช่การรับรอง)

**Contract v0.1 ที่เสนอ:**
- คง `InboundMessage` เป็น DTO ที่ "ไม่ให้สิทธิ์ใด ๆ" (ตามคอมเมนต์ `channels/index.ts:2-3`) ผู้ใช้ต้อง resolve workspace จาก `connectionId` ผ่าน contract ข้อ 3.2 เท่านั้น
- เพิ่มแนวคิด **outbound record** แยกจาก `ChannelPort.send`: ก่อนส่งทุกครั้งต้องมีแถวบันทึก (outbox) ที่มี idempotency key เพื่อให้ retry/ส่งซ้ำไม่ส่งสองครั้ง (ที่มาของข้อกำหนด: HANDOFF-002 "Duplicate send attempts produce exactly one outbound record")
- `ChannelPort.send` ต้องรับ `idempotencyKey` และ reject ด้วย `ChannelError` ที่ `retryable` ถูกต้อง; ข้อความ error จาก provider ห้ามหลุดออกมา (ตามคอมเมนต์ `channels/index.ts:39`)
- กฎ inbound: dedupe ระดับ `(connectionId, externalMessageId)` เป็น at-least-once + side effect ต้อง idempotent (ตาม semantics ของ lease ใน `ingress.ts` ที่มีอยู่แล้ว)

```ts
// ภาพประกอบเท่านั้น
interface OutboundRecord { workspaceId; connectionId; threadId; text; idempotencyKey; status: "pending"|"sent"|"failed" }
interface OutboundPort { enqueue(ctx: TrustedWorkspaceContext, rec: Omit<OutboundRecord,"status">): Promise<OutboundRecord> }
```

**เจ้าของ:** A · **ผู้ใช้:** B (LINE adapter) และ Web Chat

**ยังไม่ตัดสิน:** รูปแบบ outbox (ตารางเดียว/แยกต่อ channel), นโยบาย retry/backoff, push กับ reply token ของ LINE (ขอบเขตสาย B), ข้อความที่ไม่ใช่ text (รูป/สติกเกอร์), การรองรับ streaming ของ Web Chat

### 3.2 Tenancy / connection

**สถานะในโค้ด:**
- `platform/contracts/tenancy/index.ts:2` `export type ChannelId = "line" | "web";`
- `platform/contracts/tenancy/index.ts:8` `export type TrustedWorkspaceContext = Readonly<{` (`workspaceId`, `connectionId`, `channel`)
- `platform/contracts/tenancy/merchant.ts:12` `export interface MerchantMembershipRepositoryPort {`
- ตาราง `supabase/migrations/20261023000100_g1_workspace_host.sql:24` `  channel text NOT NULL CHECK (channel IN ('web', 'line')),` (ตาราง `workspace_connections`, `UNIQUE (connection_id, channel)`)
- `supabase/migrations/20261103000100_host_hardening.sql:100` `  USING (channel = 'web' AND aicp.is_active_workspace_member(workspace_id));` นโยบายอ่านจำกัดเฉพาะ `web` (M3 ตาม handoff)
- LINE ฝั่งเดิมเก็บ secret ใน `platform/src/line/ingress.ts:13` `  channelSecret: string;` ผ่าน `LineConnectionLookup` (ingress.ts:21) ที่ inject เข้ามา; ที่เก็บ channel secret แบบ durable ยังไม่มีใน schema (ค้นไม่พบคอลัมน์/ตาราง secret ใน 3 migration)

**Contract v0.1 ที่เสนอ:**
- `TrustedWorkspaceContext` คงรูปเดิม เป็นค่าเดียวที่ module ในแกนกลางรับ
- connection เป็น "ของ" workspace หนึ่งเดียว resolve ฝั่ง server; ฝั่ง LINE resolve จาก `destination` ที่ผ่านการตรวจลายเซ็นแล้วเท่านั้น (ไม่ใช่ก่อน)
- **ที่เก็บ channel secret ต้องแยกจากตารางที่ผู้ใช้ authenticated อ่านได้** และไม่อยู่ในคอลัมน์ธรรมดาของ `workspace_connections`; ตำแหน่งจริง (vault/secret store/ตารางจำกัดสิทธิ์) เป็นเรื่องของสาย A ตัดสินร่วมกับ Owner ภายหลัง
- สาย B ขอ migration ผ่าน contract นี้ ไม่เขียนเอง (ข้อ 9)

**เจ้าของ:** A (B เป็นผู้ขอ) · **ผู้ใช้:** B

**ยังไม่ตัดสิน:** วิธีเก็บ/หมุน channel secret, ผูก `destination` ของ LINE กับ `connection_id`, การขยายนโยบาย `workspace_connections` ให้ครอบ `line` (ต้องมี migration จากสาย A และ GO), หนึ่ง workspace มีหลาย connection ต่อ channel หรือไม่ (ปัจจุบัน index `workspace_one_active_web_connection` จำกัด web ที่ 1 active ต่อ workspace)

### 3.3 Conversation + handoff events

**สถานะในโค้ด:**
- `platform/contracts/data/conversation.ts:3` `export type ConversationStatus = "ai_active" | "handoff_requested" | "human_active";`
- `platform/contracts/data/conversation.ts:25` `export interface ConversationRepositoryPort {` (`create`, `load`, `append` พร้อม `expectedVersion`)
- `platform/contracts/data/conversation.ts:24` คอมเมนต์ระบุว่า durable replay protection ต้องมี "adapter-owned unique delivery ledger"
- `platform/modules/conversation/index.ts:90-91` `export function canSendAiReply(conversation: ConversationSnapshot): boolean {` / `  return conversation.status === "ai_active";`
- `SupportOrchestrator` ตรวจสถานะสองครั้ง: `support-orchestrator.ts:269` และ `:370` `if (... .snapshot.status !== "ai_active") return Object.freeze({ kind: "ai_paused" });`
- ที่เก็บ durable: ไม่พบตาราง conversation ใน `supabase/migrations/*.sql` (ค้น `create table` แล้วมีเฉพาะ knowledge, workspace, membership, connection, intake) เทียบกับ `tasks/TASK-HANDOFF-002-DURABLE-HANDOFF.md` ที่ยังเป็น PLANNED; `platform/modules/handoff/README.md` อ้างใน task ว่า PARTIAL (ผู้เขียนไม่ได้เปิดไฟล์นั้นเอง = UNVERIFIED)

**Contract v0.1 ที่เสนอ:**
- คง state machine 3 สถานะและ event 4 ชนิดตามเดิม (`handoff_requested`, `operator_claimed`, `staff_reply_delivered`, `handoff_released`)
- กติกาที่ล็อก: pause ต้อง durable; **ไม่มี event ใดที่ผู้เยี่ยมชมหรือลูกค้าปล่อย pause ได้**; resume ต้องผ่าน `StaffAuthorizationPort` ที่ resolve จาก session + membership ที่ active ใน transaction เดียวกับการเขียน
- การส่งต้อง atomic (compare-and-send หรือ outbox guard ตามข้อ 3.1) กันส่งซ้ำ/ส่งคำตอบ AI ขณะ pause
- ช่อง "ใครเป็นผู้ส่ง" (ai / staff / customer) และ thread identity ที่ใช้ร่วมกันทั้ง web และ line ให้ใช้ `conversationId` เดียวกันเป็นกุญแจ ไม่ให้มีรูปแบบ id เฉพาะ channel ใน contract

**เจ้าของ:** A (งาน HANDOFF-002) · **ผู้ใช้:** B

**ยังไม่ตัดสิน:** schema ตาราง conversation/event/assignment, ลำดับ event และการ replay, ข้อความที่เข้ามาระหว่าง pause ถูกเก็บอย่างไร (queue ให้พนักงานอ่าน?), ผู้ถือสิทธิ์ release (owner เท่านั้นหรือ staff ด้วย), timeout อัตโนมัติ (ไม่เสนอ: ห้ามปล่อย pause เองตาม `AGENTS.md`)

### 3.4 Knowledge: source/version/chunk/approval + visibility

**สถานะในโค้ด:**
- `platform/contracts/data/knowledge.ts:35` `export type KnowledgeVersionStatus =` (8 สถานะ: `uploaded`, `validating`, `extracting`, `indexed`, `approved`, `quarantined`, `failed`, `revoked`)
- `platform/contracts/data/knowledge.ts:162` `export interface KnowledgeRepositoryPort {`; `:193` `export interface KnowledgeApprovalPort {`; `:197` `export interface KnowledgeRetrievalPort {`
- กรองก่อน retrieval: `platform/modules/knowledge/index.ts:493` `    if (item.source.status !== "active" || item.version.status !== "approved") continue;`
- RLS แบบ `app.workspace_id`: `supabase/migrations/20261022000100_knowledge.sql:134` `  USING (workspace_id = current_setting('app.workspace_id', true))`
- **visibility ไม่มีในโค้ด:** ค้น `visibility` ใน `platform/` และ `supabase/` (.ts/.sql) ไม่พบ (ผลค้นหาข้อความ) ตรงกับแผน 3 สายที่ว่า "approval มีแล้ว visibility ยังไม่มี"
- เส้นทางอนุมัติ: ฟังก์ชัน DB `aicp.approve_knowledge_version` ใน `supabase/migrations/20261103000100_host_hardening.sql:36` (PR #26 ระบุว่ายังไม่เคยรันบน Supabase จริง = UNVERIFIED ว่าทำงานจริง)

**Contract v0.1 ที่เสนอ (ขึ้นกับคำตัดสินข้อ 4.1):**
- เพิ่ม `visibility: "internal" | "customer"` ที่ระดับ **version** (หรือ source; ดูข้อ 4.1) ค่าเริ่มต้นเมื่อไม่ระบุ = `internal` (fail closed)
- `KnowledgeRetrievalQuery` เพิ่มฟิลด์ **audience** (`"customer" | "staff"`) ที่ server กำหนดจากช่องทางที่ถาม ไม่รับจาก request: คำถามจากผู้เยี่ยมชม/LINE ลูกค้า = `customer` เห็นเฉพาะ chunk ที่ `visibility = customer`; หน้า console ของร้าน = `staff` เห็นได้ทั้งสอง
- กฎ: การตรวจ freshness (`areCurrentCitations`) ต้องตรวจ visibility ซ้ำด้วย กัน visibility เปลี่ยนระหว่างสร้างคำตอบ
- การเปลี่ยน visibility ของ version ที่ approve แล้ว ถือเป็น event ที่ต้อง audit และต้องไม่ย้อนให้ citation เก่าอ้างได้

```ts
// ภาพประกอบเท่านั้น
type KnowledgeVisibility = "internal" | "customer";
type KnowledgeAudience = "customer" | "staff";
```

**เจ้าของ:** A (schema, migration, port) · C เสนอ field · **ผู้ใช้:** A, C

**ยังไม่ตัดสิน:** ระดับที่ผูก visibility (source vs version vs chunk), กระบวนการ candidate → review → publish → revoke ของสาย C (C2) ว่าเพิ่ม status ใหม่หรือไม่, การตั้ง visibility ตอนอัปโหลด vs ตอน approve, migration ของข้อมูลเดิม

### 3.5 Business Configuration schema

**สถานะในโค้ด:** ไม่มี ค้น `business.?config` ในไฟล์ .ts/.sql ของ `platform/` และ `supabase/` ไม่พบ; `platform/contracts/config/` ที่แผน 3 สายระบุเป็นเส้นทางของสาย C ยังไม่มีอยู่ใน main (ไม่พบใน `find platform` ที่ตรวจ)

**Contract v0.1 ที่เสนอ (ขึ้นกับข้อ 4.1):**
- Business Configuration คือ **data เวอร์ชันได้** ต่อ workspace ที่ validate ก่อนบันทึก (schema validation แบบ strict: ฟิลด์ที่ไม่รู้จักถูกปฏิเสธ) และมี `schemaVersion` + `configVersion`
- เนื้อหาเป็นกฎ/พารามิเตอร์ที่ร้านกำหนด (เช่น หัวข้อที่ต้อง handoff เสมอ, น้ำเสียง, เวลาทำการ) แต่ **ตัวอย่างในเอกสารนี้ไม่ใช้กฎร้านจริง**
- config เป็น input ของ host เท่านั้น: host โหลดด้วย `TrustedWorkspaceContext` แล้วส่งค่าที่ validate แล้วเข้า module; module ไม่อ่าน config เอง ไม่มีชื่อร้านในโค้ด
- การเปลี่ยน config ต้องมี audit และ activate แบบมีเวอร์ชัน (rollback ไป version ก่อนได้) ไม่แก้ทับ
- config ห้ามเป็นช่องให้ยกระดับสิทธิ์: ไม่มีฟิลด์ที่ปิด approval, ปิด fail-closed, หรือข้าม handoff

```ts
// ภาพประกอบเท่านั้น (ไม่ใช่ schema จริง)
type BusinessConfigurationV0 = Readonly<{ schemaVersion: 0; configVersion: number; /* ฟิลด์ที่ validate แล้ว */ }>;
interface BusinessConfigurationPort { loadActive(ctx: TrustedWorkspaceContext): Promise<BusinessConfigurationV0 | null> }
```

**เจ้าของ:** C · **ผู้ใช้:** A (host โหลด)

**ยังไม่ตัดสิน:** รายการฟิลด์จริง (ต้องรอ C0: ประเภทร้าน/ปัญหาแรก), ที่เก็บ (ตารางใน schema `aicp` หรือไฟล์ต่อ instance), ใครแก้ได้ (owner เท่านั้น?), ภาษาในการเขียน config, ความสัมพันธ์กับ `BusinessActionProposal` (`platform/contracts/business-actions/index.ts:34`) ที่มีอยู่

### 3.6 Answer path

**สถานะในโค้ด:**
- `platform/modules/ai-engine/support-orchestrator.ts:235` `export class SupportOrchestrator {` รับ `SupportOrchestratorPorts` (`:64`) = `conversations`, `retrieval`, `evidenceFreshness`, `answerability`, `answer`, `handoff`
- ลำดับ: เช็ค `ai_active` (`:269`) → `retrieval.search` (`:275`: `retrieval = await this.ports.retrieval.search({ workspace: request.workspace, query: request.query, limit: this.evidenceLimit });`) → answerability → generate → ตรวจ citation → `areCurrentAndApproved` (`:362`) → เช็ค `ai_active` ซ้ำ (`:370`) → ตอบ; ล้มเหลว/ไม่พอ = `handoff.request` (`:420`)
- ผลลัพธ์ `SupportReply` (`:55`) 7 แบบ รวม `ai_paused` และ `conversation_changed`
- `GroundedAnswerPort` (`:24`) คืนข้อความ + `citationRefs` ที่เป็น reference ทึบ แล้ว engine แมปเป็น citation มาตรฐานเอง
- **extractive default ยังไม่มีในโค้ด:** คำว่า `extractive` ปรากฏเฉพาะในเอกสาร (`tasks/TASK-WEBCHAT-001-VISITOR-CHAT.md`, `plans/*`) ไม่มีในไฟล์ .ts/.sql; การทำ port แบบ extractive เป็นงาน WEBCHAT-001 (ยัง PLANNED)

**Contract v0.1 ที่เสนอ:**
- ล็อก `SupportOrchestrator` + ports เป็นเส้นทางเดียวของคำตอบสำหรับทุก channel
- ค่าเริ่มต้นของ `GroundedAnswerPort` = extractive ตอบจากข้อความที่ถูก cite แบบคำต่อคำ (หรือแม่แบบจำกัด) ตาม D-20261025-09; port แบบ model สร้างได้เมื่อ flag เปิดเท่านั้น และ flag ปิดเป็นค่าเริ่มต้น
- เพิ่มกฎ: audience และ visibility (ข้อ 3.4) ต้องไหลเข้า `retrieval.search` และ `evidenceFreshness`; ประเภท `SupportEvidence` ที่ส่งให้ model ต้องผ่านการกรอง visibility มาก่อนแล้ว
- Business Configuration (ข้อ 3.5) เข้าทาง host/construction ของ ports ไม่ใช่ให้ orchestrator อ่านเอง
- กติกาเดิมที่คงไว้: ไม่มีหลักฐาน/ขัดแย้ง/ไม่แน่ใจ/query ยาวเกิน = handoff; model output ไม่ authorize การกระทำใด

**เจ้าของ:** A · **ผู้ใช้:** B, C

**ยังไม่ตัดสิน:** รูปแบบ extractive จริง (WEBCHAT-001), การเลือก provider/model/งบ (ต้อง Owner อนุมัติแยก), ภาษา/น้ำเสียงของ template, วิธีส่ง audience เข้า `KnowledgeRetrievalQuery` ว่าเป็น breaking change หรือ additive (stop condition ใน WEBCHAT-001 บังคับให้รายงาน delta ก่อนแก้)

### 3.7 Instance packaging

**สถานะในโค้ด:** ไม่มี; `architecture/merchant-brain/README.md` ระบุว่า Technology Stack, Repository Layout และ Deployment Kit เป็นข้อเสนอเท่านั้น และ "ยังไม่ได้ทดลองจริงว่าโค้ดปัจจุบันรองรับทั้งสองแบบ" (instance แยกต่อร้านกับ SaaS)

**Contract v0.1 ที่เสนอ:** **ไม่ล็อกอะไรใน v0.1** บันทึกเพียงข้อจำกัดที่สัญญาข้ออื่นต้องไม่ขัด: (ก) โค้ดกลางรันได้ทั้ง 1 instance ต่อร้านและหลาย workspace ต่อ instance (จึงคง `workspace_id`, ข้อ 4.2) (ข) ค่าเฉพาะ instance อยู่ใน env/config นอก repo (ค) ไม่มี secret หรือ project ref จริงใน repo

**เจ้าของ:** C เสนอ · **ผู้ใช้:** เลื่อนไปหลัง v0.1

**ยังไม่ตัดสิน:** ทุกอย่าง: รูป deploy kit, backup/rollback, วิธีสร้าง instance ใหม่, การตั้ง env, การทดลอง C3

---

## 4. คำตัดสินที่ต้องขอจาก Owner

### 4.1 ใส่ visibility (internal/customer) และ Business Configuration schema ใน v0.1 หรือไม่

- **คำตัดสิน Owner: ใส่** (D-20261104-06)
- **คำแนะนำ: ใส่** (ใส่ใน v0.1 ในระดับ "รูปทรงและกฎ" ไม่ใช่ฟิลด์ครบ)
- **ข้อดี:** visibility เป็นด่านความปลอดภัย (กันข้อมูลภายในหลุดถึงลูกค้า) การเติมทีหลังต้องแก้ port, retrieval และ migration ที่ทุกสายใช้ร่วมกัน; ล็อกก่อนทำให้สาย B/C ออกแบบบนฐานเดียว ค่าเริ่มต้น `internal` เป็น fail closed
- **ข้อเสีย/ความเสี่ยง:** เพิ่มขอบเขตให้ contract รอบแรก; ระดับที่ผูก visibility (source/version/chunk) อาจตัดสินพลาด; Business Configuration ยังไม่รู้ฟิลด์จริงจนกว่า C0 จะเสร็จ จึงควรล็อกแค่โครง (versioned, validate, ไม่ยกระดับสิทธิ์)
- **ถ้าไม่ใส่:** v0.1 เล็กลง ส่งเร็วกว่า แต่สาย C รอ และเสี่ยง migration รอบสอง

### 4.2 คง `workspace_id` ในโค้ดสำหรับ instance แยกต่อร้านหรือไม่

- **คำตัดสิน Owner: คง** (D-20261104-06)
- **คำแนะนำ: คง** (สอดคล้อง D-20261102-24)
- **ข้อดี:** ไม่ปิดทาง SaaS (G3); RLS, `TrustedWorkspaceContext` และเทสต์ cross-tenant ที่มีอยู่ใช้ต่อได้; instance แยกต่อร้านก็แค่มี workspace เดียว
- **ข้อเสีย:** มี overhead ของ tenancy ที่ instance เดี่ยวไม่ได้ใช้ และเสี่ยงให้คนเข้าใจผิดว่าข้ามการตรวจ tenant ได้เพราะมีร้านเดียว (กฎข้อ 1.2 ยังบังคับ)
- **ถ้าลบ:** โค้ดเรียบกว่าในระยะสั้น แต่ต้องรื้อ RLS, port ทั้งหมด และทำใหม่เมื่อทำ SaaS
- หมายเหตุ: "คง" ยังไม่ได้พิสูจน์ด้วยการทดลอง (C3 ยังไม่เคยทำ) = UNVERIFIED

---

## 5. สาย LINE แบบ offline (B0-B1) ใช้อะไรจาก contract ได้บ้าง

ตาม D-20261103-29: fake transport, ไม่มี LINE OA จริง, ไม่มี credential, หลัง contract นี้ถูกล็อก

**ใช้ได้ (อ่านและ implement ฝั่ง adapter):**
- `InboundMessage`, `ChannelPort`, `ChannelError`/`ChannelErrorCode` (ข้อ 3.1) เป็น DTO/port ที่ adapter ต้อง normalize เข้าและส่งออก
- `TrustedWorkspaceContext` และกฎ resolve workspace จาก connection (ข้อ 3.2) โดย lookup เป็น stub/fake ที่ inject ใน test
- `SupportOrchestrator` และ ports (ข้อ 3.6) เรียกเส้นทางเดียวกับ Web Chat ได้ด้วย port fake
- กติกา conversation/handoff (ข้อ 3.3) เป็นเงื่อนไขที่ test ต้องยืนยัน: pause ต้องไม่ถูก LINE event ของลูกค้าปล่อย
- ส่วน LINE ที่มีอยู่ (`platform/src/line/ingress.ts`: signature, normalize, `LineEventDeduplicator`) เป็นฐานอ้างอิงตามสถานะปัจจุบัน

**ห้าม / ยังไม่ได้ในช่วง B0-B1:**
- ไม่เรียก LINE API จริง ไม่ใช้ channel secret/token จริง ไม่ตั้ง webhook สาธารณะ
- ไม่เขียน migration ไม่แก้ `workspace_connections` หรือนโยบาย (ข้อ 3.2) ขอผ่านสาย A เท่านั้น
- ไม่สร้างที่เก็บ secret แบบ durable เอง (ยังไม่ตัดสิน)
- ไม่ต่อ durable handoff/outbox จริง (B2 รอ HANDOFF-002) ใช้ fake port ใน test
- ไม่แก้ `platform/modules/*` ที่ใช้ร่วม ยกเว้นผ่าน PR อ้างเวอร์ชัน contract (ข้อ 6)
- ไม่ใส่ข้อมูลหรือกฎร้านจริงใน fixture ใช้ข้อมูลสังเคราะห์เท่านั้น
- LINE sandbox จริง (B3) รอ G1 accepted

สิ่งที่ผูกกับ visibility (ข้อ 3.4): adapter ฝั่งลูกค้า LINE ต้องถูกจัดเป็น audience `customer` เสมอ

## 6. Change control

1. **Migration มีเจ้าของเดียว = สาย A** (`supabase/migrations/`) สาย B/C ที่ต้องแก้ schema ส่ง request อ้าง contract ข้อที่เกี่ยวข้อง แล้ว A เป็นผู้เขียน
2. **module และ contract ที่ใช้ร่วม** (`platform/contracts/*`, `platform/modules/knowledge`, `platform/modules/ai-engine`, `platform/modules/conversation`) แก้ได้ผ่าน PR ที่ระบุ "Core Contract v0.1" (หรือเวอร์ชันที่ล็อก) และข้อที่แก้ในคำอธิบาย PR
3. การเปลี่ยนที่ breaking ต่อ port ที่ล็อก ต้องหยุดและรายงาน delta ก่อนแก้ (ตรงกับ stop condition ใน WEBCHAT-001 / HANDOFF-002) และปรับเลขเวอร์ชัน contract (v0.2) ไม่แก้ v0.1 ย้อนหลัง
4. เปลี่ยนแบบ additive (ฟิลด์ optional ที่มีค่าเริ่มต้น fail closed) ยังต้องผ่าน PR + reviewer
5. ทุก PR: เทสต์สดแนบ, security impact, cost impact, ระดับไม่เกิน BUILD_PASS, ไม่ self-merge, worktree อยู่ใน `.worktrees/<task>/` (`AGENTS.md`)
6. การ apply migration ลง Supabase และการแตะระบบจริงต้องมี Owner GO ของงานนั้น เอกสารนี้ไม่ให้สิทธิ์ดังกล่าว

## 7. รายการ UNVERIFIED

1. เลขคำตัดสิน D-xxxx ทั้ง 7 รายการ ยังไม่ได้เทียบกับ DECISIONS-REGISTER ใน vault; ที่มาคือ repo, `AGENTS.md` และ handoff/แผน 3 สายใน draft PR #27 (ไม่ได้ merge)
2. แผน 3 สายและ handoff ที่ใช้อ้างอยู่บน branch `origin/claude/project-thread-8xgsii` ยังไม่ merge เข้า main; ตารางเจ้าของ/ผู้ใช้ในข้อ 2 จึงเป็นข้อเสนอ
3. `platform/modules/handoff/README.md` ว่า PARTIAL: อ้างจาก task ไม่ได้เปิดไฟล์
4. migration, ฟังก์ชัน `approve_knowledge_version`, PostgREST RPC, `auth.uid()` ใต้ SECURITY DEFINER และนโยบาย RLS ไม่เคยรันบน Supabase จริง (PR #26 รายงานเอง); เอกสารนี้อ่านจากตัวไฟล์ SQL เท่านั้น
5. ข้อความ "ไม่มี" (visibility, outbox, Business Configuration, extractive ในโค้ด, ตาราง conversation, ที่เก็บ channel secret) มาจากการค้นข้อความใน `platform/` และ `supabase/` ไม่ใช่การพิสูจน์ว่าไม่มีในทุกที่
6. `platform/modules/*/README.md` อื่นและ `platform/src/core` ไม่ได้เปิดอ่านครบ สถานะ "partial/มีแล้ว" ของ module อ้างจากฟังก์ชันที่เปิดดูเท่านั้น
7. ความเข้ากันได้ของโค้ดปัจจุบันกับ instance แยกต่อร้านและ SaaS พร้อมกัน ยังไม่เคยทดลอง
8. ข้อเสนอการเพิ่ม audience ใน `KnowledgeRetrievalQuery` ยังไม่ได้ตรวจว่า breaking หรือ additive กับผู้เรียกทุกราย
9. ระดับ readiness: ไม่มีการรันเทสต์ในรอบนี้ ไม่มีการยกระดับเกิน BUILD_PASS
