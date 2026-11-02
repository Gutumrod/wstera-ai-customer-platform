# Merchant Brain — Workflow

ร่างแนวคิดตามบรีฟ Owner วันที่ 29 ตุลาคม 2026 สำหรับระบบของร้านค้า 1 ร้าน ยังไม่ใช่ข้อสรุป Architecture หรือระบบที่ Implement แล้ว

## อ่านบอร์ด

1. ด้านบน: แบ่งขอบเขตลูกค้ากับ WSTERA — ลูกค้าเป็นเจ้าของข้อมูลร้าน Accounts Domain Media Business Configuration และ Infrastructure ตามที่ตกลง; ได้สิทธิ์ใช้งาน แต่ไม่ได้กรรมสิทธิ์ Core Code
2. แถว 01: ลูกค้าปรับธุรกิจผ่าน Dashboard → ตรวจและบันทึก Config → Merchant Brain ใช้ Core + ข้อมูล + Rules → ระบบของร้านนำไปใช้
3. แถว 02: WSTERA แก้ Core ใน Private Repo → Review/Tests/Security → Release ที่ระบุ Version/Commit → Backup ก่อนเปลี่ยน → Controlled Deploy → ตรวจหลัง Deploy
4. แถว 03 อ่านขวาไปซ้าย: พบเหตุ → ตรวจ Audit Log → เลือก Rollback Core หรือ Restore ข้อมูลตามสาเหตุ → ตรวจการกู้ → กลับมาใช้งาน
5. ด้านล่าง: เจ้าของ Infrastructure ยังแก้ระบบได้บางส่วน จึงต้องใช้สิทธิ์การเข้าถึง กระบวนการ Deploy และข้อตกลงดูแลร่วมกัน; งานกู้จากการแก้โค้ดหรือ Infrastructure โดยไม่ได้รับอนุญาต อาจคิดเพิ่มตามสัญญา

## แยกบรีฟกับข้อเสนอ

Owner ระบุโดยตรง: WSTERA ดูแล Core/Security/Updates/Deployment/Bug Fixes, ลูกค้าปรับสินค้า ราคา รูปภาพ Rules ผ่าน Dashboard, ต้องมี Backup/Audit Log/Rollback และต้องแยกสิทธิ์ใช้งานออกจากกรรมสิทธิ์ Core

ข้อเสนอที่เติมเพื่อให้ Flow ครบลูป: validation และ versioning ของ Configuration, ตรวจหลัง Deploy, ตรวจความเข้ากันได้ก่อนกู้และตรวจผลหลัง Restore, ช่องทาง/Automation ในฐานะส่วนที่จะเชื่อมต่อ ไม่ได้กำหนดว่ามีระบบใดพร้อมแล้ว

## เรื่องที่ยังต้องล็อกก่อนพัฒนา

- ร้านประเภทใด และปัญหาที่ Merchant Brain ต้องแก้เป็นอย่างแรก
- ช่องทางหรือระบบที่ต้องเชื่อม และ thin vertical slice แรก
- สิทธิ์ Owner/พนักงาน/WSTERA และขอบเขตการเข้าถึง Infrastructure
- Backup retention, RPO/RTO และวิธีซ้อม Restore
- ขั้นอนุมัติ Release, compatibility ของข้อมูล/Config และเงื่อนไข Rollback
- ขอบเขตสัญญาดูแลและการคิดค่ากู้คืนเมื่อมีการแก้นอกกระบวนการ

## ไฟล์และการตรวจ

- Merchant Brain — Workflow.tldraw: ไฟล์หลัก แก้ไขกล่องและข้อความต่อได้
- Merchant-Brain-Workflow.jpg: ภาพความละเอียดเต็มสำหรับเปิดดูหรือส่งต่อ
- ตรวจในแอป: 40 shapes, 13 arrows, 26 arrow bindings; ทุกลูกศรผูกทั้งสองปลาย, canvas linter ไม่พบปัญหา, บันทึกไฟล์แล้วและไม่มี unsaved changes

ไม่ได้แก้แอปหรือ repository ของ Merchant Brain และไม่ได้ Deploy ระบบใด
