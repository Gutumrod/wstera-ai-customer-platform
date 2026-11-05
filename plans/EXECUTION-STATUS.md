# Execution Status

Updated: 2026-11-05 (evening) against `main` at `303312c` (PR #45 merge); หัวข้อ "รันบนโปรเจกต์ทดสอบ 2026-11-05" ด้านล่างชนะข้อความเก่าที่ขัดกัน. Earlier text was recorded at `b080d57`. Earlier text below was recorded at `e47bb57` and `9b4f997`. This records merged repository state, not product or release approval.

## Current milestone

PR #16 merged the consolidated Phase 0C and G1 foundation work. On 2026-10-25, PR #18 merged the local-only authenticated knowledge host, PR #19 merged a pure PromptPay payload builder, PR #20 merged the typed business-action lifecycle contract/reducer, and PR #21 merged source-import provenance and pilot-gate documentation. PR #24 later added Merchant Brain documents only, at `e47bb57`; the host evidence below was recorded at `9b4f997dc3783c253461a52f70e240d325ff05ec`. PR #18 reports 145 tests, typecheck and optimized Next.js build passing, zero audit findings, and a second-pass review with no actionable High/Medium findings on its candidate; the later independent review `REVIEW-PR18-2026-10-25.md` found M1–M3, and PR #18 merged with them as debt that must close before Gate 3 (register `D-20261025-08`). The authenticated browser-to-Supabase E2E was not run. GitHub returned no combined-status records for the latest merge commit in this status check, so a fresh unified CI result for `9b4f997` is not asserted. These merges do not mean G1 product acceptance or release readiness.

| Area | Merged evidence | Still required for G1 / release |
|---|---|---|
| Phase 0C | Shared tenancy/channel contracts, compatibility exports, and CI trigger update | Remaining modular increments only when separately scoped |
| Knowledge | FAQ lifecycle, bounded local PDF/CSV extraction, deterministic Thai/SKU retrieval, citations, PostgreSQL adapter and PGlite tests; PR #18 adds local synthetic authenticated upload/review/approval and citation search | browser-to-`wstera-lab` E2E, production connection/role wiring, answer quality evidence |
| Handoff | Local state machine, authorization/repository ports, response orchestration | Durable staff state and atomic channel dispatch/compare-and-send |
| AI | Citation provenance validator and metered OpenAI-compatible adapter with mocked transport | Approved live provider/model, semantic answer evaluation, durable usage and spend control |
| PostgreSQL | PGlite RLS/lifecycle tests; historical two-session PostgreSQL evidence from 2026-10-18 | Hosted connection pool/runtime role, host threat review for custom-GUC RLS |
| Verification | Prior PR #16 evidence: 129 tests and 30 synthetic retrieval queries. PR #18 candidate evidence: 145 tests, build and audit; independent review left M1–M3 open, later closed in code by PR #26/#28 (CI recorded on `250bb67` and `acb0e9e`) | Unified CI result for `b080d57`; browser-to-`wstera-lab` host E2E; real one-shop upload → cited answer → durable human handoff trace and independent security acceptance |

PR #19 provides a pure PromptPay EMVCo payload builder; it is not wired to a payment flow and has no real banking-app scan proof. PR #20 provides typed action contracts and a pure lifecycle reducer; it does not include an executor or business writes. PR #21 records provenance and pilot criteria. P3A executor and P4 PromptPay wiring remain planned and unauthorized tasks.

## Merged since 2026-11-02 (BUILD_PASS only)

PR #25 (HOST-004: lab mode fails closed) and PR #23 (AICP objects in schema `aicp`) are merged. PR #26 and PR #28 merged HOST-002: route tests, per-identity rate limits, transactional membership revalidation and M1–M3 closed in code, with revoke/archive moved behind authenticated RPCs. PR #29 merged Core Contract v0.1 as a DRAFT; no independent review report is recorded in `reports/`. PR #30–#33 merged WEBCHAT-001: per-version `visibility` and retrieval `audience`, the visitor chat page with signed session and rate limits, extractive answer and answerability ports, merchant intake `visibility`, and the wire to `SupportOrchestrator`. `npm run check` on `b080d57` reported 423 tests.

The merged `main` snapshot described above did not include the local Web Chat host or HANDOFF-002 candidate. (ข้อความนี้ล้าสมัยแล้ว ดูหัวข้อ "รันบนโปรเจกต์ทดสอบ 2026-11-05" ด้านล่าง) At that snapshot no migration had run on Supabase and the database evidence was PGlite only. CI runs recorded for HOST-002 cover `250bb67` and `acb0e9e`; a unified CI result for `b080d57` is not asserted here. Nothing above is `PRODUCTION_READY`.

WEBCHAT-HOST-001 follow-on (2026-11-05, branch `codex/aicp-webchat-host-20261105`): local Next.js routes and PostgreSQL/PGlite host composition now exist, with PGlite integration tests. The migration has not run on Supabase and routes are not deployed.

HANDOFF-002 candidate (2026-11-05, branch `codex/aicp-handoff-002-20261105`, based on `main` @ `beb0aa50f4e4043585349a347947fee5dfd670b7`): durable local PostgreSQL conversations/messages/outbox, staff Inbox API/UI, and cookie-bound customer staff updates are implemented. D-20261105-09 keeps AI active during `handoff_requested` and pauses only at `human_active`. PGlite covers seven migrations, role compatibility, restart readback, outbox/reply idempotency, membership/workspace denial and customer updates. `npm run check` passed: typecheck, 481 tests and optimized merchant-console build. No hosted migration, external notification, model call or production deployment occurred. Message retention is not configured; independent review is pending. See `tasks/TASK-HANDOFF-002-DURABLE-HANDOFF.md` for the candidate gates and current verification.

## รันบนโปรเจกต์ทดสอบ 2026-11-05

ระดับสูงสุดที่อ้างได้ = **รันครั้งเดียวบนโปรเจกต์ทดสอบ Supabase ที่แยกต่างหาก ด้วยข้อมูลสังเคราะห์** (Owner GO D-20261105-13, อนุมัติแผน D-20261105-15) ไม่ใช่ระดับที่สูงกว่านั้น ไม่มี traffic จริง ไม่มีลูกค้าจริง ยังไม่มีการตรวจอิสระของหลักฐานชุดนี้ หลักฐานดิบอยู่ใน vault `06-Agent-Logs/WSTERA-House/evidence-aicp-20261105/` (ไฟล์ 01 ถึง 70) และ project ref ไม่ใส่ใน repo นี้ (public)

| เรื่อง | ผลจริง | ไฟล์หลักฐาน |
|---|---|---|
| preflight และ probe สิทธิ์ | ผ่าน ไม่มี STOP, probe ไม่เข้าเกณฑ์ล้ม | 01, 02 |
| apply migration | ผ่านครบ 8 ไฟล์ (ไฟล์ที่ 8 `20261105000300_model_usage.sql` apply ทีหลัง) ไม่มี ERROR/WARNING | 11 ถึง 19 |
| SQL ตรวจหลัง apply | ทุกค่าตรงที่คาด | 20, 21, ท้าย 19 |
| seed + ผู้ใช้ทดสอบ cross-workspace | สำเร็จ (ล้ม 2 ครั้งจากบั๊กสคริปต์ seed แก้แล้วในคอมมิต `e30c458`) | 30 ถึง 33 |
| เปิด Data API schema `aicp` | Owner เปิดเอง อ่านกลับได้ | 34 |
| E2E ระดับ API | 26/26 รอบแรก, 25/26 รอบซ้ำ (ข้อที่ตกเป็นสคริปต์นับแหล่งตายตัว ร้านอื่นยืนยันแยกแล้วว่าเห็นแต่ของตัวเอง) | 41, 42 |
| บั๊กจาก E2E 3 ข้อ (แก้ใน PR #44) | ลองซ้ำผ่าน | 50, 51 |
| เส้นโมเดล flag ปิด/เปิด | เรียกโมเดลจริง 7 ครั้ง ledger settled 7 แถว 2,028 token, ถึงเพดานตกกลับ extractive | 60, 61, 62 |
| latency บน build จริง (`start:console`) | ตอบ P50 8.4 วินาที, ส่งพนักงาน P50 7.8 วินาที (n=24) | 70 |

**ยังไม่ได้ลอง (รอ Owner):** ฟอร์ม login บนเบราว์เซอร์, knowledge console, หน้า `/handoffs` · **ยังไม่ได้ทำ:** rollback และเก็บกวาดโปรเจกต์ทดสอบ, เทสต์ 4 คีย์ provider · **เส้นโมเดลปิดอยู่** (flag `AICP_MODEL_ANSWERS_ENABLED` ปิดโดยตัวห่อ เว้นแต่ใส่ `AICP_TEST_MODEL=on`) · ไม่มี deploy ไม่มีการใช้จ่ายจริง (ราคาตั้ง 0 ตามแผนเหมา)

ตัวเลขเวลา 8 วินาทีต่อข้อความ **ไม่ใช่ค่าบนโฮสต์จริง**: วัดจากเครื่องในไทยไปฐานข้อมูล eu-central-1 (คำสั่งละประมาณ 190 ms) ดูรายการใน `plans/BLOCKERS.md` B-06

## Owner decisions 2026-10-25

Docker Desktop is withdrawn from this machine; the host E2E runs against schema `aicp` on `wstera-lab`, and applying the migration needs a separate Owner GO (register `D-20261025-11`). The G1 answer path is extractive citations by default with the model-backed path behind an off-by-default flag; turning the flag on needs separate Owner approval, a budget ceiling, a usage ledger and a data-region choice. Owner work order (`D-20261025-09`) is host hardening → Web Chat → durable handoff → G1 acceptance. Proposed before it, not an Owner decision: HOST-004, then the Owner GO and PR #23 merge decision.

## Remaining G1 work

Task G1-HOST-001 is merged via PR #18: local synthetic authenticated merchant console, workspace resolution, private knowledge upload/quarantine/approval and citation-backed search. Automated checks and reviews are reported in PR #18, with M1–M3 later closed in code by PR #26/#28; browser-to-Supabase E2E remains unverified. This slice does not include Web Chat, generated answers, or durable handoff.

The local synthetic host's Node.js + Next.js + Supabase Auth/Postgres/private Storage architecture was approved for G1-HOST-001; that approval does not extend to hosted deployment or production operation. The PDF extractor uses Node `worker_threads`, which Cloudflare Workers expose as a non-functional stub, so that extraction path cannot run there as-is. No provider spend, hosted migration, customer data or deployment has been authorized.

G2 LINE pilot, G3 self-service multi-tenant onboarding, and G4 commercial validation remain gated behind G1 evidence. Future hosted evaluation region (Singapore), deletion and backup-retention defaults are proposals only and need separate Owner approval.
