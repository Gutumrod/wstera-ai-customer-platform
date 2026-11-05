# Blockers and Owner Gates

Updated: 2026-11-05 (evening), `main` at `3eeacda`. แถว B-01 ถึง B-05 ด้านล่างบันทึกเมื่อ 2026-11-02 และบางส่วนล้าสมัย (B-03: การ apply บนโปรเจกต์ทดสอบเกิดแล้ว ดูแถว B-06 ถึง B-11 และ `plans/EXECUTION-STATUS.md`).

| ID | Gate | Evidence / next action |
|---|---|---|
| B-01 | Consolidation merge/review | **Cleared for PR #16:** merged as `857b2e5`; final source head `19288ec` passed hosted CI and independent OpenCode review with no blockers in the reviewed delta. This does not certify G1 or production readiness. |
| B-02 | Hosted CI | **Cleared for PR #16:** `typescript-foundation` passed on reviewed head `19288ec` (run `39840363749`) and merge commit `857b2e5` (run `39840675679`). |
| B-03 | G1 host and product integration | **Host implementation merged in PR #18.** Docker Desktop was withdrawn (register `D-20261025-11`); the E2E now targets schema `aicp` on `wstera-lab`; proposed, not an Owner decision, after HOST-004, a separate Owner GO to apply the migration and the Owner merge decision on PR #23. Add route-level tests/rate limiting and resolve the membership-revalidation race inside the write transaction. Carried debt from `REVIEW-PR18-2026-10-25.md` (register `D-20261025-08`): M1 approval privilege mixed with ingest, M2 search/worker load bounds, M3 connection visibility — all must close before Gate 3 and are scoped into TASK-HOST-002. Web Chat and durable human-delivery path remain open. |
| B-04 | Answer quality and spend | Partly decided 2026-10-25: G1 uses extractive cited answers; the model path stays behind an off-by-default flag. Generated-answer grounding, conflicting-source policy, live-provider behavior and production cost remain unmeasured, and enabling the flag needs Owner approval plus a spend ceiling. |
| B-05 | PostgreSQL operational boundary | Open: local PGlite tests and historical 2026-10-18 two-session evidence exist; production host pool/role provisioning and trusted-host/custom-GUC threat review remain unverified. |
| B-06 | Region และความเร็วต่อข้อความ | **เปิด** ตอบแชต P50 8.4 วินาที P95 8.6 วินาที ส่งพนักงาน P50 7.8 วินาที (n=24 บน build จริง, `70-latency-start-console.txt`) เกือบทั้งหมดมาจากระยะทางเครื่องในไทยไปฐานข้อมูล eu-central-1 (190 ms ต่อคำสั่ง, ประมาณ 41 คำสั่งต่อข้อความ **UNVERIFIED** ยังไม่ได้นับ) ต้อง Owner ตัดสิน region (ข้อเสนอเดิม Singapore ยังไม่ใช่คำตัดสิน) และวัดซ้ำบนโฮสต์จริงที่อยู่ใกล้ฐานข้อมูล ก่อนสรุปว่าช้าหรือเร็ว |
| B-07 | ด่าน answerability แบบ extractive กันคำถามก่อนถึงโมเดล | **เปิด** 12 จาก 19 คำถามสังเคราะห์ถูกส่งพนักงานโดยไม่ถึงโมเดล รวมถึง warranty ไทยปนอังกฤษและราคาสองสินค้าที่มีคำตอบในเอกสารจริง (`60-compare-*.txt`) เปิดโมเดลจึงไม่เพิ่มความครอบคลุม ต้องตัดสินว่าจะปรับด่านหรือส่งคำถามให้โมเดลตัดสินเอง |
| B-08 | ไม่มี route revoke ใน console | **เปิด** ถอนเอกสารต้องเรียก RPC `aicp.revoke_knowledge_version` ด้วยผู้ใช้เจ้าของโดยตรง (พบตอนล้างข้อมูลซ้ำ; `SupabaseKnowledgeRevocation` ไม่มี route หรือ UI เรียก) จึงลอง revoke ผ่านหน้าเว็บไม่ได้ |
| B-09 | อัปโหลดเนื้อซ้ำไม่กัน | **เปิด** อัปโหลดชื่อ/เนื้อเดิมซ้ำสร้างแหล่งซ้ำได้ (`42-e2e-api-rerun.txt`) และถ้าอนุมัติทั้งคู่ extractive ตอบซ้ำสองรอบ ต้องมีด่านกันเนื้อซ้ำหรือรวมแหล่ง |
| B-10 | extractive แสดงคำสั่งที่ซ่อนในเอกสารให้ลูกค้าเห็นตรง ๆ | **เปิด** (เส้นฐาน extractive) โมเดลตัดคำสั่งนั้นทิ้งแล้วในการเทียบครั้งเดียว (`60-compare-*.txt`) ต้องมีด่านกรองก่อนอนุมัติหรือก่อนแสดง ไม่ควรพึ่งโมเดลอย่างเดียว |
| B-11 | ลองบนเบราว์เซอร์ | **ลองแล้ว** ฟอร์ม login, knowledge console, `/handoffs` ผลอยู่ใน runbook หัวข้อ 4 และ 10 · บั๊ก visibility แก้ใน PR #46 |
| B-12 | รีวิวก่อนอนุมัติไม่เห็นเนื้อหา | **เปิด** console แสดงแค่สถานะและจำนวน chunk เจ้าของร้านอนุมัติโดยไม่เห็นข้อความที่สกัด |
| B-13 | เพดานพร้อมกันของ Ollama ใช้ร่วมทั้งบัญชี | **เปิด** ทดสอบ 4 คีย์แล้วไม่แยกเพดาน ขัดกับแนวทางแยกต่อร้านใน D-20261105-18 ต้องมีตัวคุมฝั่งเราหรือแยกบัญชี และเช็กเงื่อนไขขายต่อ |
| B-14 | ด่านตอบได้ต้องใช้คำใกล้ข้อความเดิม | **เปิด** เนื้อ PDF อังกฤษตอบได้เมื่อถามด้วยคำเดิม แต่ถามเรียบเรียงใหม่หรือเป็นไทยจะส่งพนักงาน ผลอยู่ใน `81-console-upload-visibility.txt` ต้องดูร่วมกับ B-07 |

No green test clears product, deployment, production-data or spending gates by itself. No hosted migration, customer data or paid API use is authorized by PR #16 merge.
