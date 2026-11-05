# Blockers and Owner Gates

Updated: 2026-11-05 (evening), `main` at `2e10e9b`. แถว B-01 ถึง B-05 ด้านล่างบันทึกเมื่อ 2026-11-02 และบางส่วนล้าสมัย (B-03: การ apply บนโปรเจกต์ทดสอบเกิดแล้ว ดูแถว B-06 ถึง B-11 และ `plans/EXECUTION-STATUS.md`).

| ID | Gate | Evidence / next action |
|---|---|---|
| B-01 | Consolidation merge/review | **Cleared for PR #16:** merged as `857b2e5`; final source head `19288ec` passed hosted CI and independent OpenCode review with no blockers in the reviewed delta. This does not certify G1 or production readiness. |
| B-02 | Hosted CI | **Cleared for PR #16:** `typescript-foundation` passed on reviewed head `19288ec` (run `39840363749`) and merge commit `857b2e5` (run `39840675679`). |
| B-03 | G1 host and product integration | **Host implementation merged in PR #18.** Docker Desktop was withdrawn (register `D-20261025-11`); the E2E now targets schema `aicp` on `wstera-lab`; proposed, not an Owner decision, after HOST-004, a separate Owner GO to apply the migration and the Owner merge decision on PR #23. Add route-level tests/rate limiting and resolve the membership-revalidation race inside the write transaction. Carried debt from `REVIEW-PR18-2026-10-25.md` (register `D-20261025-08`): M1 approval privilege mixed with ingest, M2 search/worker load bounds, M3 connection visibility — all must close before Gate 3 and are scoped into TASK-HOST-002. Web Chat and durable human-delivery path remain open. |
| B-04 | Answer quality and spend | Partly decided 2026-10-25: G1 uses extractive cited answers; the model path stays behind an off-by-default flag. Generated-answer grounding, conflicting-source policy, live-provider behavior and production cost remain unmeasured, and enabling the flag needs Owner approval plus a spend ceiling. |
| B-05 | PostgreSQL operational boundary | Open: local PGlite tests and historical 2026-10-18 two-session evidence exist; production host pool/role provisioning and trusted-host/custom-GUC threat review remain unverified. |
| B-06 | Region และความเร็วต่อข้อความ | **เปิด เฉพาะเรื่อง region** PR #56 ลดคำสั่งฐานข้อมูลแล้ว วัดบนฐานทดสอบ eu-central-1 ด้วยข้อมูลสังเคราะห์ n=1 ต่อกรณี ฐาน `804f224` เทียบ `f25a7b3`: ปิด flag 45-51 เหลือ 32-34 คำสั่ง เวลา 8.7-9.8 เหลือ 6.7-7.1 วินาที · เปิด flag 78-94 เหลือ 58 คำสั่ง 17-21 เหลือ 13 transaction เวลาโมเดลแกว่งจึงอ้างได้เฉพาะส่วนฐานข้อมูล · ยังห่างเป้า 30 กับ 55 อยู่ 2-4 กับ 3 คำสั่ง ผลอยู่ใน `85-chat-latency-after.md` ใน vault · เหลือ Owner ตัดสิน region (ข้อเสนอเดิม Singapore ยังไม่ใช่คำตัดสิน) และวัดซ้ำบนโฮสต์จริงที่อยู่ใกล้ฐานข้อมูล ก่อนสรุปว่าช้าหรือเร็ว |
| B-07 | ด่าน answerability แบบ extractive กันคำถามก่อนถึงโมเดล | **เปิด** PR #53 ให้โมเดลตัดสินหลังค้นกว้างเมื่อเปิด flag "มีบริการอะไรบ้างครับ" ตอบพร้อมแหล่งอ้างอิงแล้ว ตอนปิด flag ยังส่งพนักงาน · ยังไม่ได้รันชุด 19 คำถามซ้ำ ตัวเลข 12 จาก 19 (`60-compare-*.txt`) จึงเป็นของก่อน PR #53 · หน้าแชตรอได้ 45 วินาที (`render-chat-page.ts:348`) รอบที่วัดเปิด flag ใช้ 13.9-19.4 วินาที |
| B-08 | ไม่มี route revoke ใน console | **ปิด** PR #51 เจ้าของร้านถอนเอกสารจาก console ได้ |
| B-09 | อัปโหลดเนื้อซ้ำไม่กัน | **ปิด** PR #54 ปฏิเสธการอัปโหลดเนื้อซ้ำ |
| B-10 | extractive แสดงคำสั่งที่ซ่อนในเอกสารให้ลูกค้าเห็นตรง ๆ | **เปิด** (เส้นฐาน extractive) โมเดลตัดคำสั่งนั้นทิ้งแล้วในการเทียบครั้งเดียว (`60-compare-*.txt`) ต้องมีด่านกรองก่อนอนุมัติหรือก่อนแสดง ไม่ควรพึ่งโมเดลอย่างเดียว |
| B-11 | ลองบนเบราว์เซอร์ | **ลองแล้ว** ฟอร์ม login, knowledge console, `/handoffs` ผลอยู่ใน runbook หัวข้อ 4 และ 10 · บั๊ก visibility แก้ใน PR #46 |
| B-12 | รีวิวก่อนอนุมัติไม่เห็นเนื้อหา | **ปิด** PR #51 เจ้าของร้านเปิดดูเนื้อหาก่อนอนุมัติได้ |
| B-13 | เพดานพร้อมกันของ Ollama ใช้ร่วมทั้งบัญชี | **เปิด** ทดสอบ 4 คีย์แล้วไม่แยกเพดาน ขัดกับแนวทางแยกต่อร้านใน D-20261105-18 ต้องมีตัวคุมฝั่งเราหรือแยกบัญชี และเช็กเงื่อนไขขายต่อ |
| B-14 | ด่านตอบได้ต้องใช้คำใกล้ข้อความเดิม | **เปิด** เนื้อ PDF อังกฤษตอบได้เมื่อถามด้วยคำเดิม แต่ถามเรียบเรียงใหม่หรือเป็นไทยจะส่งพนักงาน ผลอยู่ใน `81-console-upload-visibility.txt` ซึ่งวัดก่อน PR #53 ยังไม่ได้ลองซ้ำเมื่อเปิด flag ต้องดูร่วมกับ B-07 |

No green test clears product, deployment, production-data or spending gates by itself. No hosted migration, customer data or paid API use is authorized by PR #16 merge.
