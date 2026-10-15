# WSTERA AI Customer Platform — Project Goal

**MISSION (LOCKED):** สร้าง SaaS ที่ให้ร้านค้าใช้ AI ตอบลูกค้าจากข้อมูลร้านของตัวเองได้ง่าย ปลอดภัย ขยายได้ และ **มีลูกค้าจ่ายเงินจริงโดยต้นทุนคุ้มค่า** ไม่ใช่แค่เดโม Chatbot

## สินค้าที่ต้องสร้าง

1. **Web AI Chat:** ฝังบนเว็บไซต์ร้าน ตอบจาก Knowledge Base พร้อมแหล่งอ้างอิง และส่งต่อพนักงานเมื่อไม่มั่นใจ
2. **LINE AI Support SaaS:** ร้านสมัครเอง อัปโหลด PDF/CSV/FAQ ทดลอง AI เชื่อม LINE OA แบบ Guided Setup และรับช่วงคุยกับลูกค้าได้

**ล็อก:** ทั้ง 2 ช่องทางใช้ **Shared AI Engine + RAG + Knowledge + Policy + Conversation + Human Handoff ชุดเดียว** เพิ่มช่องทางหรือเปลี่ยน AI/Storage/Retrieval ภายหลังต้องทำผ่าน **Ports & Adapters** ไม่เขียน Core ซ้ำ

## MVP แรกที่ต้องพิสูจน์

**1 ร้าน → อัปโหลดข้อมูล → ลูกค้าถามบนเว็บ → AI ตอบตรงข้อมูลพร้อม Citation → ตอบไม่ได้ส่งต่อคนจริงได้** และไม่เห็นข้อมูลของร้านอื่น

## กฎห้ามละเมิด

- Workspace แยกข้อมูลและสิทธิ์ทุกชั้น; ไม่เชื่อ Tenant ID จาก Client หรือ AI
- ไม่เดา/ไม่สร้าง Citation ปลอม; ข้อมูลอัปโหลดเป็น Data ไม่ใช่คำสั่ง; Human Handoff ต้องหยุด AI ได้จริง
- ไม่ให้ AI ทำธุรกรรมเอง; Backend ต้องตรวจสิทธิ์ ยืนยัน และบันทึก Audit
- Free-tier-first, วัดต้นทุน; ทุกงานผ่าน Tests → Security Review → Owner Approval ก่อน Merge/Deploy

## ลำดับงาน

**G0 Foundation → G1 Web + RAG MVP → G2 LINE Pilot → G3 Multi-tenant Self-service → G4 ลูกค้าจ่ายเงินจริง**

**ตอนนี้:** ปิดข้อท้วงติง Security ของ [Task 001 / PR #2](https://github.com/Gutumrod/wstera-ai-customer-platform/pull/2) ก่อนเริ่ม Feature ใหม่; อย่า Merge/Deploy เอง

**รายละเอียดล็อกทั้งหมด:** [Product Requirements](architecture/PRODUCT-REQUIREMENTS-DETAIL.md) · [Folder Map](architecture/REPOSITORY-STRUCTURE.md) · [Adapter Rules](architecture/PORTS-AND-ADAPTERS.md) · [Roadmap](plans/PHASE-BREAKDOWN.md) · [Agent Rules](AGENTS.md)
