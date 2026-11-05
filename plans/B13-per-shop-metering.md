# B13 — วัดการใช้โมเดลต่อร้าน
โมเดลเดียว `deepseek-v4.1-flash:1017` ที่ `https://ollama.com/v1`; ร้าน/คีย์สังเคราะห์ 1–3 ผ่านตัวห่อกรอง secret.
**เอกสาร:** [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) ระบุ `/v1/chat/completions`, stream, `stream_options.include_usage`, `max_tokens`; [Usage API](https://docs.ollama.com/api/usage) ระบุ native `prompt_eval_count`/`eval_count` และ metrics ใน final stream chunk; [Pricing](https://ollama.com/pricing) ระบุคิดตาม token, concurrency/queue, Enterprise cost budget ต่อ user/API key.
เอกสารที่ตรวจไม่ระบุ API ดึง usage แยก key, response quota headers หรือรายละเอียด per-key ของหน้า account usage; native usage docs ไม่รับรอง shape ของ OpenAI-compatible response.
**วัดจริง:** 6 รอบหลัก + 1 probe = 7 HTTP 200; ไม่มี retry/429/5xx/error; non-stream และ stream คืน `usage`; ไม่พบ header ชื่อ rate/limit/usage. Token ตรงระหว่าง provider กับ ledger จำลอง.

| ร้าน | รอบหลัก: calls / input / output | probe เพิ่ม | usage |
|---|---:|---:|---|
| สังเคราะห์-1 | 1 / 37 / 19 | 1 / 37 / 32 | 2/2 |
| สังเคราะห์-2 | 2 / 74 / 39 | — | 2/2 (stream 1) |
| สังเคราะห์-3 | 3 / 111 / 112 | — | 3/3 (stream 1) |
รอบหลักรวม 6 calls, input 222, output 170; รวม probe 7 calls, input 259, output 202. ส่ง `max_completion_tokens:50` แล้วพบ output 57; probe ส่งทั้ง `max_completion_tokens:50` และ `max_tokens:50` ได้ 32. ยังยืนยัน hard cap provider ไม่ได้.
Failure case ทดสอบ offline: failed attempt แยกจาก settled และไม่เดา token; timeout/ไม่มี usage วัด token จริงไม่ได้. ไม่จงใจยิง request ล้มเหลวไป provider.

| จุดดัก | จับได้ | พลาด/ข้อจำกัด |
|---|---|---|
| Adapter `chat-completions.ts` | workspace จาก caller, attempts, response usage | timeout อาจถูกคิดแต่ไม่ทราบ; no usage วัด token ไม่ได้; retry เพิ่มยอด; ปัจจุบัน key เดียว |
| Ledger `aicp.model_usage` | durable calls/tokens ต่อ workspace; reserve/settle/fail | ไม่แยก shared provider quota; lock ต่อ workspace ไม่ global; failed/reserved ไม่ใช่ยอด provider จริง |
| Gateway กลางที่เราคุม | attribution, request log, global queue/concurrency และ policy | ต้อง route ทุก call; timeout/usage หายยังไม่รู้ token; เพิ่ม ops/availability; ไม่เปลี่ยน quota Ollama |
**แนะนำ:** ดักที่ adapter แล้วส่ง usage เข้า ledger เดิม โดยใช้ workspace จาก trusted server context; ไม่ต้องแยก API key เพื่อวัดร้าน. ก่อนเปิด model path ยืนยัน output limit/no-retry; เพิ่ม gateway/limiter เมื่อจำเป็นต้องคุม concurrency รวมทุก workspace.
วิธีนี้ **ไม่แก้เพดาน Ollama ที่แชร์ทั้งบัญชี** (ผลทดสอบ 4 key ก่อนหน้าตามข้อมูล Owner). ไม่มี migration, ฐานจริง, deploy, เปลี่ยน model runtime หรือซื้อบริการ.
**ตรวจ:** `npm run check` ผ่าน 529, fail 0 (ฐานคาด 526, เพิ่ม offline tests 3); typecheck/tests/console build และ `git diff --check` ผ่าน. ยังไม่ตรวจเงื่อนไขขายต่อ, per-key usage UI/API, timeout billing จริง หรือยืนยัน hard cap provider.
