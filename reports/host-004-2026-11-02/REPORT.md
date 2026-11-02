# HOST-004 — เปิดโหมด lab ของ merchant console

ฐาน: `codex/aicp-schema-isolation-20261025` @ `e55a008` (PR #23) · คำตัดสินอ้างอิง: `D-20261025-09`, `D-20261025-11`

ระดับ: `BUILD_PASS` เท่านั้น ไม่มีการติดต่อ hosted project ใด ๆ

## สิ่งที่เปลี่ยน

- **ด่าน env กลาง:** `lib/supabase/environment.ts` ใช้ร่วมกันใน `admin.ts`, `server.ts`, `browser.ts` และ `proxy.ts` โหมด lab รับเฉพาะ `https://<ref>.supabase.co` ที่ตรงกับ ref และค่าอื่นทั้งหมดล้ม
- **URL ฐานข้อมูล:** โหมด lab บังคับมี ref สองตัวที่ตรงกัน รับเฉพาะ `knowledge_runtime.<ref>` และ host ต้องตรงรูปแบบ pooler ปิด F-05 จาก HOST-003
- **TLS:** โหมด lab ต้องมี `SUPABASE_DB_CA_CERT` และ `PgPostgresDatabase` ตรวจใบรับรองด้วย `rejectUnauthorized: true` ไม่มีใบรับรองแล้วระบบไม่เริ่ม
- **seed:** ย้ายด่านไป `scripts/seed-environment.mjs` เพื่อให้เทสต์ได้โดยไม่ต้องมีฐานข้อมูล โหมด lab ต้องยืนยัน ref และใช้เจ้าของแบบ `@example.test` เท่านั้น
- **เอกสาร:** `README.md` แยกขั้นตั้งค่า lab และระบุว่า Docker จำเป็นเฉพาะ flow local

## พฤติกรรม local ที่เปลี่ยน

- รหัส error เปลี่ยน: `LOCAL_SUPABASE_SERVER_SECRET_REQUIRED` เป็น `SUPABASE_SERVER_SECRET_REQUIRED` และ `LOCAL_SUPABASE_PUBLIC_ENVIRONMENT_REQUIRED` เป็น `SUPABASE_PUBLIC_ENVIRONMENT_REQUIRED` หรือ `SUPABASE_APP_ENV_UNSUPPORTED`
- URL ที่ parse ไม่ได้ใน `admin.ts` และ `server.ts` ได้ `LOCAL_SUPABASE_URL_REQUIRED` แทน `TypeError`
- `seed-local.mjs` ที่ `APP_ENV` ไม่ถูกต้องได้ `SEED_REQUIRES_APP_ENV_LOCAL_OR_LAB` แทน `LOCAL_SEED_REQUIRES_APP_ENV_LOCAL`
- ค่าที่ยอมรับใน local ไม่เปลี่ยน

## ผลตรวจที่รันจริง

```text
npm run check   exit=0
tests 184 · pass 184 · fail 0 · skipped 0
next build      ผ่าน
```

สแกน diff หา token, key, private key และ project ref จริงของบ้าน ไม่พบ

## ยังไม่ได้พิสูจน์

- ยังไม่เคยเชื่อมต่อ hosted project จริง การตรวจ CA ของ pooler, การ login ของ `knowledge_runtime` ผ่าน pooler และ `createUser` บน hosted ยังไม่ถูกทดสอบ
- `supabase/config.toml` expose schema `aicp` เฉพาะ local ฝั่ง hosted ต้องตั้งบน dashboard
- `aicp_migrator` ยังเป็น NOLOGIN (N-03 จาก HOST-003) วิธี apply migration ต้องตัดสินก่อนขอ GO

## ต้องมี GO จาก Owner แยกรายเรื่อง

apply migration · ตั้งค่า dashboard · seed สังเคราะห์ · merge PR #23 · merge PR ของงานนี้

DONE
