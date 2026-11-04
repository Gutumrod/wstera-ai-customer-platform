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

---

## FIX1: การแก้ไขข้อพบจากการตรวจอิสระรอบ 1 (OpenCode Reviews rvA, rvB, rvC)

- **สถานะ:** BUILD_PASS (288 tests pass / 0 fail / `npm run check` and `git diff --check` ผ่าน 100%)
- **อ้างอิงบรีฟ:** WEBCHAT-UI-FIX1, D-20261104-11, D-20261104-10
- **ผู้ทำ:** AGY
- **ผู้ตรวจรอบถัดไป:** ผู้คุมส่ง OpenCode

### 1. รายการแก้ไขตามข้อพบ (เรียงตามลำดับความสำคัญ)

#### 1. rvA ข้อ 1 (HIGH) — ป้องกัน Signature Malleability (Base64url Canonical Encoding)
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-session.ts:114-118`, เทสต์ `platform/composition/web-chat-session.test.ts:77-93`
- **วิธีแก้:** เพิ่มการตรวจสอบ canonical encoding โดยนำ buffer ลายเซ็นที่ถอดแล้วแปลงกลับเป็น `base64url` แล้วเปรียบเทียบกับสตริง `signature` เดิมแบบ strict equality (`actualSigBuffer.toString("base64url") !== signature`) ก่อนเข้าสู่ constant-time check เพื่อปฏิเสธ trailing padding (`=`), อักขระนอก alphabet (`!`), และ alternate unused bits ท้ายสตริง
- **ผลดิบเทสต์ล้มก่อนแก้ (บนโค้ดเดิม):**
```
# Subtest: rejects tampered base64url signature variants (signature malleability)
not ok 4 - rejects tampered base64url signature variants (signature malleability)
  ---
  duration_ms: 1.1541
  type: 'test'
  location: 'D:\\AI-Workspace\\projects\\wstera-ai-customer-platform\\.worktrees\\webchat-ui-20261104\\dist\\composition\\web-chat-session.test.js:37:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected

    + {
    +   connectionId: 'conn-abc',
    +   conversationId: 'bf332831-ba60-426f-8e4e-1a1ccc238c6b',
    +   createdAt: 1793771782291,
    +   expiresAt: 1793858182291
    + }
    - null

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
```
- **ผลหลังแก้:** ผ่าน 100% (`ok 5 - rejects tampered base64url signature variants (signature malleability)`)

#### 2. rvA ข้อ 2 — บังคับคุณภาพและความยาวขั้นต่ำของ `sessionSecret`
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-session.ts:22-42`, เทสต์ `platform/composition/web-chat-session.test.ts:154-167`
- **วิธีแก้:** ใน `assertSecret` บังคับ `Buffer.byteLength(secret, "utf8") >= 32` และตรวจสอบความหลากหลายของอักขระ (ปฏิเสธ secret ที่เป็นตัวอักษรซ้ำตัวเดียว เช่น `"a".repeat(40)`) หากไม่ผ่านจะ throw `TypeError`

#### 3. rvA ข้อ 3 — ความยาวลายเซ็นไม่ตรงกันต้องคืน `null` ไม่ throw
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-session.ts:120-125`, เทสต์ `platform/composition/web-chat-session.test.ts:95-107`
- **วิธีแก้:** ตรวจสอบ `actualSigBuffer.length !== expectedSigBuffer.length` ก่อนเรียก `crypto.timingSafeEqual` และเพิ่มเทสต์สำหรับกรณีลายเซ็นสั้นกว่าปกติ (40 chars / 30 bytes) และกรณีลายเซ็นยาวเกิน (+AAAA) ยืนยันว่าคืน `null` โดยไม่โยน exception

#### 4. rvA ข้อ 4 — บังคับผูก `connectionId` แบบ Mandatory และแยกฟังก์ชัน `inspect`
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-session.ts:153-172, 199-224`, `platform/composition/web-chat-routes.ts:258, 313`
- **วิธีแก้:** บังคับพารามิเตอร์ `expectedConnectionId: string` ใน `verifySessionToken` และ `parseSessionCookie` ให้เป็น mandatory type (ไม่ใช่ optional); สร้างฟังก์ชัน `inspectSessionToken` / `inspectSessionCookie` แยกต่างหากสำหรับกรณีที่ต้องการอ่านค่าเซสชันเพื่อ resolve connection; ใน route `message` ขั้นที่ 2 ใช้ `inspectSessionCookie` เพื่อตรวจสอบลายเซ็นและดึง connection มา resolve และในขั้นที่ 8 ใช้ `parseSessionCookie` บังคับความถูกต้องของ `body.connectionId` ตรงกับคุกกี้

#### 5. rvA ข้อ 5 — ปฏิเสธคุกกี้ชื่อซ้ำใน `getCookieValue` (Ambiguity Rejection)
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-session.ts:179-197`, เทสต์ `platform/composition/web-chat-session.test.ts:139-142`
- **วิธีแก้:** ตรวจนับจำนวนคุกกี้ที่ตรงชื่อ หากพบคุกกี้ชื่อเดียวกันมากกว่า 1 ตัวให้คืน `null` ทันทีเพื่อปฏิเสธความกำกวม

#### 6. rvA ข้อ 6 — กำหนด Whitelist สำหรับ `path` ใน `formatSessionSetCookie`
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-session.ts:229-232`, เทสต์ `platform/composition/web-chat-session.test.ts:145-152`
- **วิธีแก้:** ตรวจสอบ `path` ด้วย regex `^\/[A-Za-z0-9._~/-]*$` หากมีอักขระแปลกปลอมหรือ header injection (เช่น `;`, CR, LF) ให้ throw `TypeError`

#### 7. rvA ข้อ 7 — จำกัดเพดานความยาว Token (DoS Prevention)
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-session.ts:88`, เทสต์ `platform/composition/web-chat-session.test.ts:170-181`
- **วิธีแก้:** เพิ่มเพดาน `MAX_SESSION_TOKEN_CHARS = 512` หากความยาว token เกิน ให้คืน `null` ทันทีก่อนเข้าสู่การถอดรหัส

#### 8. rvA ข้อ 8 — บังคับ Invariant ของ `ttlMs` ใน `issueWebChatSession`
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-session.ts:51-54`, เทสต์ `platform/composition/web-chat-session.test.ts:26-32`
- **วิธีแก้:** ตรวจสอบ `ttlMs` ต้องเป็น safe integer บวกที่ไม่เกิน 7 วัน (`MAX_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000`) มิฉะนั้นจะ throw `RangeError`

#### 9. rvA ข้อ 9 — เพิ่มเทสต์ครอบคลุม Edge Cases ของ Session
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-session.test.ts`
- **วิธีแก้:** เพิ่มเทสต์สำหรับ token ไม่มีจุด, จุดอยู่หัว/ท้าย, ขอบเขต `expiresAt === now` ถือว่าหมดอายุ, ความสุ่มของ conversationId ไม่ซ้ำกัน

#### 10. rvB MEDIUM-1 — บังคับขนาด Body ระหว่างอ่านแบบสตรีม (Stream-Bounded Reading)
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-routes.ts:128-176`, เทสต์ `platform/composition/web-chat-routes.test.ts:566-609`
- **วิธีแก้:** สร้างฟังก์ชัน `readBoundedBody` อ่าน chunk จาก `request.body.getReader()` พร้อมตัวนับไบต์สะสม หากพบว่าไบต์รวมเกิน `MAX_BODY_BYTES` (16 KiB) จะสั่ง `reader.cancel()` ทันทีและคืน 413 `PAYLOAD_TOO_LARGE` โดยไม่โหลดข้อมูลที่เหลือเข้าหน่วยความจำ

#### 11. rvB MEDIUM-2 — เพิ่ม Rate Limit ต่อ Client ใน `page` และผูกคีย์ Session Limiter
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-routes.ts:197-203, 290-295`, เทสต์ `platform/composition/web-chat-routes.test.ts:124-145`
- **วิธีแก้:** ใน `page` เรียก `clientLimiter.retryAfterSeconds(clientKey)` ก่อนการเรียก `resolveConnection` (ตอบ 429 พร้อม Retry-After); ใน `message` ปรับคีย์ของ session limiter เป็น `${session.connectionId}:${session.conversationId}` เพื่อป้องกันการทิ้งคุกกี้เพื่อข้าม session limit
- **ผลดิบเทสต์ล้มก่อนแก้ (บนโค้ดเดิม):**
```
# Subtest: page route enforces client rate limit with Retry-After (429)
not ok 3 - page route enforces client rate limit with Retry-After (429)
  ---
  duration_ms: 1.766
  type: 'test'
  location: 'D:\\AI-Workspace\\projects\\wstera-ai-customer-platform\\.worktrees\\webchat-ui-20261104\\dist\\composition\\web-chat-routes.test.js:99:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    200 !== 429

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
```
- **ผลหลังแก้:** ผ่าน 100% (`ok 3 - page route enforces client rate limit with Retry-After (429)`)

#### 12. rvB MEDIUM-3 — เพิ่มเทสต์แตะ Session Limit จริงและพิสูจน์ 429 เกิดก่อนตรวจขนาด Body
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-routes.test.ts:286-337`
- **วิธีแก้:** เพิ่มเทสต์ที่หมุนเวียน `clientKey` ในแต่ละคำขอ แต่ใช้ session cookie เดิม เพื่อทดสอบการแตะ `sessionLimiter` โดยตรง และส่งคำขอที่ 3 ที่โควตาเซสชันหมดพร้อม body ขนาด 30 KiB (เกิน 16 KiB) พิสูจน์ว่าได้รับ 429 `RATE_LIMITED` ก่อน ไม่ใช่ 413 `PAYLOAD_TOO_LARGE`

#### 13. rvB LOW-1 — Pin `audience` เป็น `"customer"` ที่ชั้น Route
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-routes.ts:16-21, 331`, เทสต์ `platform/composition/web-chat-routes.test.ts:32, 477`
- **วิธีแก้:** เพิ่ม `audience: "customer"` ใน type `SupportResponder` และส่งค่าคงที่ `"customer"` เมื่อเรียก `deps.responder` เสมอ

#### 14. rvB LOW-2 — ตรวจสอบ HTTP Method ใน Route Handlers
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-routes.ts:184-189, 241-246`, เทสต์ `platform/composition/web-chat-routes.test.ts:480-501`
- **วิธีแก้:** `page` รับเฉพาะ `GET, HEAD` (method อื่นตอบ 405 พร้อม header `Allow: GET, HEAD`), `message` รับเฉพาะ `POST` (method อื่นตอบ 405 พร้อม header `Allow: POST`)

#### 15. rvB LOW-4 — ปฏิเสธ `clientKey` ที่ว่างหรือเป็น Whitespace
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-routes.ts:191-194, 248-251`, เทสต์ `platform/composition/web-chat-routes.test.ts:503-524`
- **วิธีแก้:** หาก `deps.clientKey(request)` คืนค่าว่างหรือ whitespace: ใน `page` ตอบ 400 Bad Request, ใน `message` ตอบ 400 `{ error: "CLIENT_KEY_REQUIRED" }`

#### 16. rvB LOW-5 — เทสต์เส้นทาง Internal Error ไม่รั่วไหลรายละเอียดภายใน
- **ไฟล์:บรรทัด:** `platform/composition/web-chat-routes.test.ts:526-564`
- **วิธีแก้:** เพิ่มเทสต์กรณี `responder` หรือ `requestHandoff` throw error ยืนยันว่า route ตอบ 500 `{ error: "INTERNAL_ERROR" }` และไม่มีข้อความ error ดิบหรือ stack trace หลุดใน body

#### 17. rvC MEDIUM 1 — ใช้ Context-Aware JavaScript String Escaping ใน `<script>`
- **ไฟล์:บรรทัด:** `platform/apps/web-chat/render-chat-page.ts:16-24, 34-36, 252-253`, เทสต์ `platform/apps/web-chat/render-chat-page.test.ts:53-76`
- **วิธีแก้:** สร้างฟังก์ชัน `escapeJsStringLiteral` ที่ใช้ `JSON.stringify` และแทนที่ `<` ด้วย `\u003c`, `>` ด้วย `\u003e`, `&` ด้วย `\u0026`, `\u2028`, `\u2029` เพื่อให้เป็น JS string literal ที่ถูกต้อง ป้องกัน SyntaxError จาก backslash และป้องกันการปิดแท็กสคริปต์ด้วย `</script>` หรือ `<!--`

#### 18. rvC MEDIUM 2 — หน้าเว็บแมปรหัส Error เป็นข้อความไทยโดยไม่สะท้อน `data.error`
- **ไฟล์:บรรทัด:** `platform/apps/web-chat/render-chat-page.ts:328-343`
- **วิธีแก้:** ลบการนำ `data.error` มาแสดงผลโดยตรง; เพิ่มตารางแมป status code เป็นข้อความภาษาไทยสุภาพและให้คำแนะนำผู้ใช้ (401 เซสชันหมดอายุให้โหลดใหม่, 429 ส่งถี่เกินไปให้รอ, 409 สถานะเปลี่ยนให้ส่งใหม่, 413 ข้อความยาวเกิน, 503 ระบบไม่พร้อมบริการ)

#### 19. rvC LOW-3 — ใส่ Timeout ในการ Fetch และตั้ง `aria-busy`
- **ไฟล์:บรรทัด:** `platform/apps/web-chat/render-chat-page.ts:290-367`
- **วิธีแก้:** ใช้ `AbortController` กำหนด timeout 15 วินาทีในการ fetch ทั้งเส้นทาง chat message และ handoff; ตั้ง `aria-busy="true"` บน `#messages` ระหว่างรอ และแจ้งเตือนเมื่อเกิด AbortError

#### 20. rvC LOW-4 — แก้ไข Vacuous Test ใน Factory
- **ไฟล์:บรรทัด:** `platform/adapters/answers/answer-port-factory.test.ts:7-22`
- **วิธีแก้:** ส่ง options ที่มี `createModelPort` พร้อมตัวนับเข้าไปใน `createAnswerPort` โดยไม่ระบุ `modelEnabled` เพื่อพิสูจน์จริงว่าค่าเริ่มต้นจะไม่เรียก `createModelPort`

#### 21. rvC LOW-5 — ปรับ Type ของ `modelEnabled`
- **ไฟล์:บรรทัด:** `platform/adapters/answers/answer-port-factory.ts:4-7`
- **วิธีแก้:** กำหนดชนิดเป็น `modelEnabled?: boolean;` พร้อมคอมเมนต์และคงการตรวจ strict `=== true` ไว้ที่ runtime

#### 22. rvC LOW-6 — กรอง Evidence ที่ `referenceId` ว่างหรือซ้ำใน Extractive Adapter
- **ไฟล์:บรรทัด:** `platform/adapters/answers/extractive/extractive-answer-port.ts:38-42`, เทสต์ `platform/adapters/answers/extractive/extractive-answer-port.test.ts:91-110`
- **วิธีแก้:** กรองรายการที่มี `referenceId` ว่างหรือ whitespace ออก และใช้ `seenRefs` Set ป้องกันการ cite ซ้ำ

#### 23. rvC LOW-7 — ตัดข้อความโดยไม่ตัดกลาง Surrogate Pairs
- **ไฟล์:บรรทัด:** `platform/adapters/answers/extractive/extractive-answer-port.ts:11-19, 57`, เทสต์ `platform/adapters/answers/extractive/extractive-answer-port.test.ts:112-126`
- **วิธีแก้:** สร้าง `truncateSafely` ป้องกันการตัดแยกคู่ surrogate code units (D800-DBFF) และเพิ่มเทสต์สำหรับกรณี evidence ชิ้นเดียวมีขนาดยาวเกิน `MAX_EXTRACTIVE_CHARS`

#### 24. rvC LOW-8 — ตรวจสอบ Style Nonce, Script Injection และป้องกัน Inline Event Handlers
- **ไฟล์:บรรทัด:** `platform/apps/web-chat/render-chat-page.test.ts:14-34, 53-76`
- **วิธีแก้:** เพิ่ม assertion ว่าทุก `<style>` มี `nonce`, ทดสอบ inject `connectionId` ที่มี `</script>`, `<!--`, quote, backslash ยืนยันว่าไม่หลุดสคริปต์และคอมไพล์ผ่าน `new Function` ได้โดยไม่มี SyntaxError, และยืนยันว่าไม่มี inline event handlers (`<... on...=>`)

---

### 2. ข้อที่ไม่ทำและเหตุผล

1. **rvC LOW-9 (`<noscript>`):** หน้าแชตนี้เป็น web chat interface แบบ dynamic SPA ซึ่งจำเป็นต้องใช้ JavaScript ในการส่งข้อความผ่าน fetch API และเชื่อมต่อกับ worker; การทำ fallback แบบ HTML-only form POST ยังไม่มี endpoint รองรับใน scope ของ Phase 1 (ระบบรองรับ client fetch เท่านั้น)
2. **rvC LOW-10 (Port ไม่ใช้ `query`/`workspaceId`):** สถาปัตยกรรมของ WSTERA แยกความรับผิดชอบชัดเจนตาม Ports & Adapters โดยความเกี่ยวข้องของเนื้อหา (relevance) เป็นหน้าที่ของ `AnswerabilityPort` และการคุมขอบเขต workspace เป็นหน้าที่ของ `validateAnswerCitations` ซึ่งตรวจสอบที่ downstream; การเพิ่ม logic ตรวจคะแนนหรือ query ซ้ำซ้อนใน `extractive-answer-port` จะละเมิด single responsibility principle

---

### 3. ผลการรันเทสต์เต็ม (Raw Test Output)

ผลลัพธ์จากการรัน `npm run check` (typecheck + test 234 suites / 288 tests + build:console):

```
> wstera-ai-customer-platform@0.1.0 check
> npm run typecheck && npm test && npm run build:console

> wstera-ai-customer-platform@0.1.0 typecheck
> tsc --noEmit

> wstera-ai-customer-platform@0.1.0 test
> npm run build && node --test dist/src/tests/core.test.js ... dist/adapters/answers/extractive/extractive-answer-port.test.js dist/adapters/answers/answer-port-factory.test.js dist/composition/web-chat-session.test.js dist/apps/web-chat/render-chat-page.test.js dist/composition/web-chat-routes.test.js

> wstera-ai-customer-platform@0.1.0 build
> tsc

✔ factory default (undefined options) returns extractive port without calling createModelPort (0.7288ms)
✔ factory with modelEnabled: false returns extractive port and does not call createModelPort (0.804ms)
✔ all non-boolean-true values for modelEnabled are treated as disabled and never invoke createModelPort (0.2497ms)
✔ factory with modelEnabled: true invokes createModelPort and returns its instance (0.1785ms)
✔ factory with modelEnabled: true throws if createModelPort is not provided (0.4579ms)
✔ extractive answer port returns verbatim excerpts and citationRefs for up to 2 items (1.4163ms)
✔ extractive answer port bounds total characters to constant limit (0.9193ms)
✔ extractive answer port does not answer when evidence is empty (0.1516ms)
✔ extractive answer port does not answer when evidence items have only empty or whitespace text (0.1254ms)
✔ prompt-injection inside evidence is returned verbatim as plain data without being executed (0.1328ms)
✔ extractive answer port skips evidence items with empty, whitespace, or duplicate referenceId (0.1834ms)
✔ extractive answer port safely truncates single evidence item that exceeds MAX_EXTRACTIVE_CHARS (0.1926ms)
...
✔ issues session with valid UUID conversationId and given connectionId (1.2533ms)
✔ issueWebChatSession enforces invariants and rejects invalid connectionId or ttlMs (0.3497ms)
✔ signs and verifies valid session token (0.7968ms)
✔ rejects forged or tampered signature (0.3149ms)
✔ rejects tampered base64url signature variants (signature malleability) (0.3482ms)
✔ rejects signature length mismatch without throwing (0.2137ms)
✔ rejects expired session token including exact boundary (0.2392ms)
✔ rejects connectionId mismatch and requires non-empty expectedConnectionId (0.1451ms)
✔ parses cookie from Cookie header string correctly and rejects duplicate cookies (0.5627ms)
✔ formatSessionSetCookie sets HttpOnly, SameSite=Strict, and Secure flag, and rejects invalid path (1.1286ms)
✔ assertSecret rejects empty, short (<32 bytes), or repeating character secret (0.283ms)
✔ inspectSessionToken rejects oversized tokens or malformed payload (0.0742ms)
✔ renderChatPage output contains no occurrences of innerHTML (0.7592ms)
✔ every script and style tag in renderChatPage output has nonce attribute matching parameter (0.8775ms)
✔ renderChatPage includes accessible landmarks, live region, and buttons (0.2317ms)
✔ renderChatPage safely escapes connectionId and endpoint against script injection and backslash syntax errors (0.5925ms)
✔ page route returns 404 when connectionId is missing or resolve fails (15.981ms)
✔ page route sets signed session cookie and strict CSP for resolved connection (1.5968ms)
✔ page route enforces client rate limit with Retry-After (429) (1.0668ms)
✔ message route rejects missing or foreign Origin (403) (2.6709ms)
✔ message route rejects missing, forged, or expired session cookies (401) (1.4569ms)
✔ message route returns 404 when connection in cookie cannot be resolved (0.727ms)
✔ message route rejects unsupported Content-Type (415) (0.474ms)
✔ message route enforces client and session rate limits with Retry-After (429) (1.5836ms)
✔ message route enforces session rate limit directly and yields 429 before checking oversized body (1.2172ms)
✔ message route rejects oversized body (413) and malformed JSON (400) (1.039ms)
✔ message route strictly rejects disallowed fields: workspaceId, audience, conversationId (400) (1.5355ms)
✔ message route rejects connectionId mismatch between body and cookie (401) (0.3521ms)
✔ message route executes handoff action and calls requestHandoff with server-resolved workspace (0.3737ms)
✔ message route returns answer with citation chips describing source title and position (0.3988ms)
✔ page and message routes reject disallowed HTTP methods (405) (0.27ms)
✔ page and message routes reject empty or whitespace clientKey (400) (0.3185ms)
✔ message route returns 500 without leaking error details when responder or handoff throws (0.7819ms)
✔ message route aborts streamed body exceeding MAX_BODY_BYTES (413) (0.7698ms)
✔ message route omits citation chip when describeCitation returns null (0.474ms)
✔ message route maps responder status to standardized HTTP responses (1.1141ms)

ℹ tests 288
ℹ suites 0
ℹ pass 288
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5997.0398

> wstera-ai-customer-platform@0.1.0 build:console
> npm run build && next build --webpack platform/apps/merchant-console

> wstera-ai-customer-platform@0.1.0 build
> tsc

▲ Next.js 16.4.2 (webpack)
✓ Running next.config.ts took 113ms

  Creating an optimized production build ...
✓ Compiled successfully in 1086ms
  Running TypeScript ...
  Finished TypeScript in 1271ms ...
  Collecting page data using 8 workers ...
  Generating static pages using 8 workers (0/2) ...
✓ Generating static pages using 8 workers (2/2) in 483ms
  Finalizing page optimization ...
  Collecting build traces ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/knowledge/search
├ ƒ /api/knowledge/sources
├ ƒ /api/knowledge/sources/[sourceId]/versions/[versionId]/approve
└ ƒ /login

ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

DONE
