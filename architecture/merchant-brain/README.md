# Merchant Brain

Merchant Brain คือชั้นผลิตภัณฑ์บนแพลตฟอร์มนี้ ไม่ใช่ Core แยกอีกชุด (Owner ตัดสิน 2026-11-02, register `D-20261102-23` และ `D-20261102-24`)

**สถานะ:** Discovery ยังไม่มีการ Implement จากเอกสารชุดนี้ และยังไม่ล็อก Core Contract v0.1

## ทิศทางที่ล็อกแล้ว

- `platform/` ของ repo นี้คือ Core ที่พัฒนาต่อ ไม่เขียนสมองใหม่ที่อื่น
- เริ่มแบบ instance แยกต่อร้าน และคง SaaS แบบร้านสมัครเอง (G3) ไว้ในแผนระยะยาว ยังไม่ได้ทดลองจริงว่าโค้ดปัจจุบันรองรับทั้งสองแบบ
- ร้านนำร่องเป็นแค่สนามทดลอง กฎเฉพาะร้านห้ามอยู่ใน Core และห้ามขึ้น repo นี้ระหว่างที่ยัง public

## ยังเป็นแค่ข้อเสนอ

- Technology Stack, Repository Layout และ Deployment Kit ในเอกสารต้นฉบับ
- ถ้าเอกสารชุดนี้ขัดกับ `BRIEF.md`, `AGENTS.md` หรือ `plans/` ให้ยึดไฟล์เหล่านั้น แล้วบันทึกความขัดแย้งไว้ก่อน

## ไฟล์

- [Merchant-Brain-Core-Platform-2026-10-29.txt](Merchant-Brain-Core-Platform-2026-10-29.txt): ขอบเขต Core, Business Modules, Data Model และลำดับพัฒนาที่เสนอ
- [Merchant-Brain-Workflow.md](Merchant-Brain-Workflow.md): คำอธิบายบอร์ด Ownership, งานประจำวัน, Core Release และ Recovery
- `Merchant Brain — Workflow.tldraw`: บอร์ดต้นฉบับ แก้ต่อได้ใน tldraw Offline
- [Merchant-Brain-Workflow.jpg](Merchant-Brain-Workflow.jpg): ภาพบอร์ด

ที่มาของไฟล์อยู่ใน [SOURCE-IMPORT-PROVENANCE.md](../SOURCE-IMPORT-PROVENANCE.md)
