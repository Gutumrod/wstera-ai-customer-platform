# รายงานผลการพัฒนา WEBCHAT-UI (ก้อน 2 ของ WEBCHAT-001)

- **LANE:** AICP
- **Task:** WEBCHAT-001 Chunk 2 (Visitor Chat Page, Signed Session, Rate Limiting, Extractive Cited Answers, Answer Port Factory)
- **Base commit:** `main` @ `5ec0518`
- **Branch:** `agy/aicp-webchat-ui-20261104`
- **Worktree:** `D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/webchat-ui-20261104`
- **สถานะ:** BUILD_PASS (ยังไม่มีเส้น end-to-end กับ orchestrator จริงและฐานข้อมูล เนื่องจากรอก้อน 1)
- **อ้างอิงคำสั่ง:** D-20261104-11, D-20261025-09, D-20261103-01, D-20261104-06

---

## 1. ไฟล์ที่เพิ่มและแก้ไข

### ไฟล์ใหม่ที่สร้าง
1. `platform/adapters/answers/extractive/extractive-answer-port.ts`: ตัวทำ `GroundedAnswerPort` ดึงข้อความจาก approved evidence แบบคำต่อคำ (สูงสุด 2 รายการ, รวมไม่เกิน 2,000 ตัวอักษร) คืน `{ text, citationRefs }` ไม่ตอบเมื่อไม่มี evidence (คืน `null` เพื่อให้ orchestrator ไปทาง handoff) ปฏิบัติต่อข้อความใน evidence เป็น DATA ล้วน
2. `platform/adapters/answers/extractive/extractive-answer-port.test.ts`: เทสต์ 5 กรณีของ extractive answer port (คำต่อคำ 2 รายการ, จำกัดความยาว, ไม่มี evidence, evidence มีแต่ช่องว่าง, prompt-injection เป็นข้อความธรรมดา)
3. `platform/adapters/answers/answer-port-factory.ts`: `createAnswerPort({ modelEnabled, createModelPort })` ปิดเป็นค่าเริ่มต้น คืน extractive port เมื่อปิด และไม่เรียก `createModelPort` เด็ดขาด; เปิดเฉพาะเมื่อ `modelEnabled === true`
4. `platform/adapters/answers/answer-port-factory.test.ts`: เทสต์ 5 กรณีของ factory (ปิดเป็นค่าเริ่มต้น, modelEnabled: false, ค่า truthy อื่น ๆ เช่น "true", 1, {}, modelEnabled: true พร้อมนับ invocation)
5. `platform/composition/web-chat-session.ts`: คุกกี้เซสชัน HMAC-SHA256 ด้วย `node:crypto` (`timingSafeEqual`) ค่า HttpOnly, SameSite=Strict, Secure (เมื่อสั่ง) ผูก `conversationId` ที่สุ่มด้วย `crypto.randomUUID()`, `connectionId`, วันหมดอายุ; ตรวจสอบลายเซ็น/วันหมดอายุ/connectionId
6. `platform/composition/web-chat-session.test.ts`: เทสต์ 8 กรณีของ session (ออก UUID, ตรวจลายเซ็น, ปฏิเสธลายเซ็นปลอม/ถูกดัดแปลง, ปฏิเสธคุกกี้หมดอายุ, ปฏิเสธ connectionId ไม่ตรง, parse จาก header, format Set-Cookie, ปฏิเสธ secret ว่าง)
7. `platform/composition/web-chat-routes.ts`: `createWebChatRoutes(deps)` คืน `{ page(request), message(request) }` มาตรฐาน:
   - `page`: อ่าน query `?c=<connectionId>` -> `resolveConnection(connectionId, "web")` จากฝั่ง server (ไม่พบ = 404 ไม่บอกเหตุ, ห้ามตั้งคุกกี้ก่อน resolve) -> ตั้งคุกกี้เซสชันใหม่ถ้าไม่มี -> CSP `frame-ancestors 'none'`, nonced script, ไม่ตรวจ Origin สำหรับ GET ปกติ
   - `message`: ลำดับตรวจเข้มงวด: client rate limit (429 มี Retry-After) -> ตรวจลายเซ็น/อายุคุกกี้ (401) -> `resolveConnection` จาก connectionId ในคุกกี้ (404) -> Origin เทียบ `allowedOrigins(workspace)` (403, ไม่มี Origin = 403) -> Content-Type `application/json` (415) -> session rate limit (429 มี Retry-After ก่อนอ่าน body) -> อ่าน body (ขนาด 413, JSON/ฟิลด์ 400 ปฏิเสธ workspaceId, audience, conversationId เด็ดขาด) -> `connectionId` ใน body ต้องตรงกับคุกกี้ (401) -> รองรับ action `handoff` (200 `handoff_recorded`) และ chat query ผ่าน `SupportResponder` -> แปลงคำตอบพร้อมชิปแหล่งที่มา (title จาก dep `describeCitation`, version, locator position; describeCitation คืน null = ไม่แสดงชิปนั้น)
8. `platform/composition/web-chat-routes.test.ts`: เทสต์ 14 กรณีครอบคลุมทุก gate และลำดับการตรวจของ `page` และ `message`
9. `platform/apps/web-chat/render-chat-page.ts`: `renderChatPage({ connectionId, nonce })` เรนเดอร์ HTML ภาษาไทย เข้าถึงได้ตามมาตรฐาน (label, aria-live, แป้นพิมพ์ใช้ได้), ปุ่มขอคุยกับพนักงาน, ชิปแหล่งที่มา, แสดงผลด้วย `textContent` เท่านั้น ไม่มีคำว่า `innerHTML`
10. `platform/apps/web-chat/render-chat-page.test.ts`: เทสต์ตรวจจับว่าไม่มีคำว่า `innerHTML` ใน HTML เด็ดขาด, ทุก `<script>` มี `nonce`, และมี accessibility landmarks ครบถ้วน
11. `reports/webchat-ui-2026-11-04/REPORT.md`: รายงานฉบับนี้

### ไฟล์ที่แก้ไข
- `package.json`: เพิ่ม 5 ไฟล์เทสต์ใหม่ต่อท้ายสคริปต์ `test` โดยคงรายการเดิมครบถ้วน
- `platform/apps/web-chat/README.md`: อัปเดตสถานะจริงของโฟลเดอร์ web-chat ตามงานที่ส่งมอบ

---

## 2. ผลการรันเทสต์เต็ม (Raw Test Output)

ผลลัพธ์จากการรัน `npm run check` (typecheck + test 209 suites / 261 tests + build:console):

```
> wstera-ai-customer-platform@0.1.0 check
> npm run typecheck && npm test && npm run build:console

> wstera-ai-customer-platform@0.1.0 typecheck
> tsc --noEmit

> wstera-ai-customer-platform@0.1.0 test
> npm run build && node --test dist/src/tests/core.test.js ... dist/adapters/answers/extractive/extractive-answer-port.test.js dist/adapters/answers/answer-port-factory.test.js dist/composition/web-chat-session.test.js dist/apps/web-chat/render-chat-page.test.js dist/composition/web-chat-routes.test.js

> wstera-ai-customer-platform@0.1.0 build
> tsc

TAP version 13
# Subtest: factory default (undefined options) returns extractive port without calling createModelPort
ok 1 - factory default (undefined options) returns extractive port without calling createModelPort
# Subtest: factory with modelEnabled: false returns extractive port and does not call createModelPort
ok 2 - factory with modelEnabled: false returns extractive port and does not call createModelPort
# Subtest: all non-boolean-true values for modelEnabled are treated as disabled and never invoke createModelPort
ok 3 - all non-boolean-true values for modelEnabled are treated as disabled and never invoke createModelPort
# Subtest: factory with modelEnabled: true invokes createModelPort and returns its instance
ok 4 - factory with modelEnabled: true invokes createModelPort and returns its instance
# Subtest: factory with modelEnabled: true throws if createModelPort is not provided
ok 5 - factory with modelEnabled: true throws if createModelPort is not provided
# Subtest: extractive answer port returns verbatim excerpts and citationRefs for up to 2 items
ok 6 - extractive answer port returns verbatim excerpts and citationRefs for up to 2 items
# Subtest: extractive answer port bounds total characters to constant limit
ok 7 - extractive answer port bounds total characters to constant limit
# Subtest: extractive answer port does not answer when evidence is empty
ok 8 - extractive answer port does not answer when evidence is empty
# Subtest: extractive answer port does not answer when evidence items have only empty or whitespace text
ok 9 - extractive answer port does not answer when evidence items have only empty or whitespace text
# Subtest: prompt-injection inside evidence is returned verbatim as plain data without being executed
ok 10 - prompt-injection inside evidence is returned verbatim as plain data without being executed
...
# Subtest: renderChatPage output contains no occurrences of innerHTML
ok 178 - renderChatPage output contains no occurrences of innerHTML
# Subtest: every script tag in renderChatPage output has nonce attribute matching parameter
ok 179 - every script tag in renderChatPage output has nonce attribute matching parameter
# Subtest: renderChatPage includes accessible landmarks, live region, and buttons
ok 180 - renderChatPage includes accessible landmarks, live region, and buttons
# Subtest: page route returns 404 when connectionId is missing or resolve fails
ok 181 - page route returns 404 when connectionId is missing or resolve fails
# Subtest: page route sets signed session cookie and strict CSP for resolved connection
ok 182 - page route sets signed session cookie and strict CSP for resolved connection
# Subtest: message route rejects missing or foreign Origin (403)
ok 183 - message route rejects missing or foreign Origin (403)
# Subtest: message route rejects missing, forged, or expired session cookies (401)
ok 184 - message route rejects missing, forged, or expired session cookies (401)
# Subtest: message route returns 404 when connection in cookie cannot be resolved
ok 185 - message route returns 404 when connection in cookie cannot be resolved
# Subtest: message route rejects unsupported Content-Type (415)
ok 186 - message route rejects unsupported Content-Type (415)
# Subtest: message route enforces client and session rate limits with Retry-After (429)
ok 187 - message route enforces client and session rate limits with Retry-After (429)
# Subtest: message route rejects oversized body (413) and malformed JSON (400)
ok 188 - message route rejects oversized body (413) and malformed JSON (400)
# Subtest: message route strictly rejects disallowed fields: workspaceId, audience, conversationId (400)
ok 189 - message route strictly rejects disallowed fields: workspaceId, audience, conversationId (400)
# Subtest: message route rejects connectionId mismatch between body and cookie (401)
ok 190 - message route rejects connectionId mismatch between body and cookie (401)
# Subtest: message route executes handoff action and calls requestHandoff with server-resolved workspace
ok 191 - message route executes handoff action and calls requestHandoff with server-resolved workspace
# Subtest: message route returns answer with citation chips describing source title and position
ok 192 - message route returns answer with citation chips describing source title and position
# Subtest: message route omits citation chip when describeCitation returns null
ok 193 - message route omits citation chip when describeCitation returns null
# Subtest: message route maps responder status to standardized HTTP responses
ok 194 - message route maps responder status to standardized HTTP responses
# Subtest: issues session with valid UUID conversationId and given connectionId
ok 195 - issues session with valid UUID conversationId and given connectionId
# Subtest: signs and verifies valid session token
ok 196 - signs and verifies valid session token
# Subtest: rejects forged or tampered signature
ok 197 - rejects forged or tampered signature
# Subtest: rejects expired session token
ok 198 - rejects expired session token
# Subtest: rejects connectionId mismatch
ok 199 - rejects connectionId mismatch
# Subtest: parses cookie from Cookie header string correctly
ok 200 - parses cookie from Cookie header string correctly
# Subtest: formatSessionSetCookie sets HttpOnly, SameSite=Strict, and Secure flag
ok 201 - formatSessionSetCookie sets HttpOnly, SameSite=Strict, and Secure flag
# Subtest: assertSecret rejects empty or invalid secret
ok 202 - assertSecret rejects empty or invalid secret
...
1..209
# tests 261
# suites 0
# pass 261
# fail 0
# cancelled 0
# skipped 0
# todo 0

> wstera-ai-customer-platform@0.1.0 build:console
> npm run build && next build --webpack platform/apps/merchant-console

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/knowledge/search
├ ƒ /api/knowledge/sources
├ ƒ /api/knowledge/sources/[sourceId]/versions/[versionId]/approve
└ ƒ /login
```

---

## 3. ผลการทดสอบ Mutation (ถอดการตรวจสำคัญ 3 จุดเพื่อพิสูจน์ว่าเทสต์ล้มจริง)

### Mutation 1: ถอดการตรวจ Origin ใน `platform/composition/web-chat-routes.ts`
- **การดัดแปลงชั่วคราว:** คอมเมนต์ปิดบล็อกการตรวจ `request.headers.get("origin")` และ `allowedOrigins`
- **ผลดิบที่เทสต์ล้ม:**
```
not ok 3 - message route rejects missing or foreign Origin (403)
  ---
  duration_ms: 2.5048
  type: 'test'
  location: 'D:\\AI-Workspace\\projects\\wstera-ai-customer-platform\\.worktrees\\webchat-ui-20261104\\dist\\composition\\web-chat-routes.test.js:99:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    200 !== 403

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 403
  actual: 200
  operator: 'strictEqual'
```
- **สถานะ:** คืนโค้ดเดิมเรียบร้อย เทสต์กลับมาผ่าน 100%

### Mutation 2: ถอดการตรวจลายเซ็น HMAC ใน `platform/composition/web-chat-session.ts`
- **การดัดแปลงชั่วคราว:** คอมเมนต์ปิดการเรียก `crypto.timingSafeEqual` ใน `verifySessionToken`
- **ผลดิบที่เทสต์ล้ม:**
```
not ok 3 - rejects forged or tampered signature
  ---
  duration_ms: 1.1464
  type: 'test'
  location: 'D:\\AI-Workspace\\projects\\wstera-ai-customer-platform\\.worktrees\\webchat-ui-20261104\\dist\\composition\\web-chat-session.test.js:21:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + {
    +   connectionId: 'conn-hacked',
    +   conversationId: 'be365570-ef7b-4ba0-846f-f02e18a5f765',
    +   createdAt: 1793765141630,
    +   expiresAt: 1793851541630
    + }
    - null

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
```
- **สถานะ:** คืนโค้ดเดิมเรียบร้อย เทสต์กลับมาผ่าน 100%

### Mutation 3: แก้การตรวจ flag จาก `=== true` เป็น `Boolean(options.modelEnabled)` ใน `platform/adapters/answers/answer-port-factory.ts`
- **การดัดแปลงชั่วคราว:** เปลี่ยนเงื่อนไขเช็ค strict boolean `=== true` เป็น truthy
- **ผลดิบที่เทสต์ล้ม:**
```
not ok 3 - all non-boolean-true values for modelEnabled are treated as disabled and never invoke createModelPort
  ---
  duration_ms: 0.4774
  type: 'test'
  location: 'D:\\AI-Workspace\\projects\\wstera-ai-customer-platform\\.worktrees\\webchat-ui-20261104\\dist\\adapters\\answers\\answer-port-factory.test.js:23:1'
  failureType: 'testCodeFailure'
  error: 'Expected extractive adapter for candidate: true'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: true
  actual: false
  operator: '=='
```
- **สถานะ:** คืนโค้ดเดิมเรียบร้อย เทสต์กลับมาผ่าน 100%

---

## 4. ข้อที่ไม่ได้ทำพร้อมเหตุผล และส่วนที่รอก้อน 1

1. **การต่อสายเข้ากับ `SupportOrchestrator` จริง:**
   - **เหตุผล:** ก้อน 1 (OpenCode) กำลังแก้ไข contract เพิ่ม `audience` ใน `SupportOrchestrator.respond` ขนานกัน การเรียก orchestrator ตรง ๆ ในตอนนี้จะเกิด breaking conflict ดังนั้นจึงแยกชั้นการพึ่งพาผ่าน interface `SupportResponder` ที่ประกาศใน `platform/composition/web-chat-routes.ts`
   - **Next Action:** เชื่อมต่อ `SupportResponder` เข้ากับ `SupportOrchestrator` จริงหลังจากก้อน 1 ถูก merge เข้า `main`
2. **การฝังข้ามไซต์ด้วย iframe:**
   - **เหตุผล:** ขอบเขตของ Phase 1 ล็อกความปลอดภัยด้วย `frame-ancestors 'none'` และคุกกี้ `SameSite=Strict` เพื่อป้องกัน clickjacking และ CSRF; การอนุญาต cross-origin iframe และ session partition เป็นงานใน Phase ถัดไป
3. **การสร้างตาราง origins หรือ database migration:**
   - **เหตุผล:** เป็นข้อห้ามของบรีฟ (ห้ามเขียน migration) และสอดคล้องกับ CORE-CONTRACT-v0.1 ข้อ 3.2 ที่ origin list ต้องเป็น server-injected policy function (`allowedOrigins(connection)`) ไม่ใช่คอลัมน์ในฐานข้อมูล

---

## 5. บันทึกกระบวนการตรวจตามกฎ 7E

เนื่องจากงานนี้แตะต้องระบบ Session และ Authentication จึงต้องผ่านการตรวจสองฝ่าย (OpenCode และ AGY) ตามกฎ 7E แต่เนื่องจาก AGY เป็นผู้พัฒนาก้อนนี้ ผู้คุมจึงจะเป็นผู้ตรวจสอบโค้ดและรันเทสต์เองแทนผู้ตรวจคนที่สอง ก่อนส่งต่อให้ OpenCode ตรวจสอบตามคำสั่ง D-20261104-11

DONE
