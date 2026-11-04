# รายงานภารกิจ WEBCHAT-INTAKE — Visibility ในเส้นอัปโหลดเอกสาร & แก้ path ส่งข้อความ (N1)

**LANE:** AICP
**ผู้ทำ:** Antigravity (AGY)
**ฐานโค้ด:** `main` @ `12fa011`
**สาขา:** `agy/aicp-webchat-intake-20261104`
**Worktree:** `D:/AI-Workspace/projects/wstera-ai-customer-platform/.worktrees/webchat-intake-20261104`
**อ้างอิง:** D-20261104-25, D-20261104-26, ผลตรวจ N1 ใน `D:/AI-Workspace/runtime/dispatch/out/aicp-wc-rvC2-oc.out`, `architecture/CORE-CONTRACT-v0.1.md` ข้อ 3.4
**ระดับการยืนยันสูงสุด:** BUILD_PASS (ผ่านการคอมไพล์ TypeScript, ทดสอบ 297/297 ผ่านบน PGlite ในโปรเซส และ Next.js production build ไม่ได้ทดสอบกับ Supabase จริง)

---

## 1. ผลลัพธ์และสิ่งที่แก้ไข (Summary of Changes)

### (ก) เส้นอัปโหลดความรู้รองรับ `visibility` (`internal` | `customer`)
1. **`platform/modules/knowledge/index.ts`**:
   - เพิ่ม `visibility?: KnowledgeVisibility;` ในพารามิเตอร์ `input` ของ `prepareKnowledgeDocumentVersion`
   - ส่งต่อ `visibility: input.visibility` เข้าไปยัง `createImportedKnowledgeVersion`
   - ไม่ได้แตะส่วนอื่นใดของโมดูล knowledge ตามข้อห้ามในบรีฟ
2. **`platform/composition/knowledge-intake.ts`**:
   - นำเข้า `KnowledgeVisibility` จาก contracts
   - เพิ่ม `visibility?: KnowledgeVisibility;` ใน `KnowledgeIntakeInput`
   - ส่งต่อ `visibility: input.visibility` ให้ทั้งทาง `createFaqVersion` และ `prepareKnowledgeDocumentVersion`
   - รักษากลไก quarantine/audit เดิมไว้ครบถ้วน และไม่ส่งผลกระทบเมื่อไม่ระบุ visibility
3. **`platform/apps/merchant-console/lib/knowledge-routes.ts`**:
   - เพิ่ม `"visibility"` ใน `assertKnownFields(form, ["kind", "title", "content", "file", "visibility"])`
   - ตรวจสอบค่า `form.get("visibility")`:
     - หากเป็น `null` (ไม่ได้ส่งมาในฟอร์ม): แปลงเป็นค่าไม่ระบุ โดยไม่ใส่คีย์ `visibility` ในออบเจ็กต์ที่ส่งต่อ เพื่อให้ fallback เป็น `internal` ที่ชั้น data ตามข้อสังเกตของบรีฟ
     - หากเป็น `"internal"` หรือ `"customer"`: ส่งต่อตามค่านั้นตรงตัว
     - หากเป็นสตริงว่าง (`""`), ชนิดอื่น, หรือสตริงค่าอื่น: โยน `HttpError(400, "INVALID_KNOWLEDGE_INPUT")` ทันทีก่อนเขียนแถวหรือบันทึกไฟล์ใดๆ
   - ป้องกันไม่ให้อ่าน `visibility` จากเนื้อหาไฟล์ และมาจากฟอร์มที่ยืนยันตัวตนแล้วเท่านั้น

### (ข) ปิดข้อพบ N1 ของหน้าแชต (Message Endpoint)
> **หมายเหตุขอบเขต:** ปิดที่ระดับ API route และ page renderer เท่านั้น (`createWebChatRoutes` + `renderChatPage`) ยังไม่มีโฮสต์จริงเรียก `createWebChatRoutes` นอกเทสต์ (งานต่อสายโฮสต์เป็นภารกิจแยก) จึงไม่ได้อ้างว่าปิด end-to-end ทั้งระบบ
1. **`platform/apps/web-chat/render-chat-page.ts`**:
   - ลบค่าเริ่มต้น fallback `"./message"` ออกอย่างถาวร
   - กำหนดให้ `messageEndpoint: string` เป็นพารามิเตอร์บังคับของ `RenderChatPageParams`
2. **`platform/composition/web-chat-routes.ts`**:
   - กำหนดให้ `messageEndpoint: string` เป็น dependency บังคับใน `WebChatRoutesDeps`
   - ตรวจสอบความถูกต้องตั้งแต่ตอนสร้าง route (`createWebChatRoutes`): ต้องเป็นสตริงที่ไม่ว่างและขึ้นต้นด้วย `/` (absolute path) หากเป็นค่าสัมพัทธ์ (เช่น `./message`, `message`), ค่าว่าง หรือไม่ใช่สตริง ให้ throw Exception ทันที
   - ส่งต่อ `deps.messageEndpoint` เข้าไปใน `renderChatPage({ connectionId, nonce, messageEndpoint: deps.messageEndpoint })`
3. **อัปเดตเทสต์เดิมที่ได้รับผลกระทบ**:
   - `platform/apps/web-chat/render-chat-page.test.ts`: ระบุ `messageEndpoint: "/chat/message"` ในจุดที่เรียกฟังก์ชัน
   - `platform/composition/web-chat-routes.test.ts`: ระบุ `messageEndpoint: "/chat/message"` ใน `createHarness`

---

## 2. รายการไฟล์ที่เปลี่ยนแปลง (Files Changed)

- `package.json` — ต่อท้าย `dist/composition/webchat-intake.test.js` ในคำสั่ง `test`
- `platform/modules/knowledge/index.ts` — รับและส่งต่อ `visibility` ใน `prepareKnowledgeDocumentVersion`
- `platform/composition/knowledge-intake.ts` — รับและส่งต่อ `visibility` ใน `KnowledgeIntakeInput` และ `ingestKnowledgeVersion`
- `platform/apps/merchant-console/lib/knowledge-routes.ts` — รับฟิลด์ `visibility`, ตรวจสอบค่า และส่งต่อ
- `platform/apps/web-chat/render-chat-page.ts` — กำหนด `messageEndpoint` เป็นพารามิเตอร์บังคับและลบ `"./message"`
- `platform/apps/web-chat/render-chat-page.test.ts` — ส่ง `messageEndpoint` ในการทดสอบ
- `platform/composition/web-chat-routes.ts` — บังคับ absolute `messageEndpoint` ใน deps และส่งต่อให้หน้าแชต
- `platform/composition/web-chat-routes.test.ts` — ระบุ `messageEndpoint` ใน harness
- `platform/composition/webchat-intake.test.ts` — เทสต์ชุดใหม่ครอบคลุมทุกเงื่อนไข

---

## 3. หลักฐานการทดสอบ TDD (Raw Before/After Outputs)

### 3.1 ผลดิบก่อนแก้ (Before Codebase)
รัน `dist/composition/webchat-intake.test.js` บนโค้ดเดิมก่อนแก้ พบว่าเทสต์ล้มด้วย Assertion Error 6 ข้อ จาก 9 ข้อ:
```text
TAP version 13
# Subtest: intake accepts visibility=customer for FAQ and stores visibility=customer
not ok 1 - intake accepts visibility=customer for FAQ and stores visibility=customer
  ---
  duration_ms: 2091.7707
  type: 'test'
  location: 'D:\AI-Workspace\projects\wstera-ai-customer-platform\.worktrees\webchat-intake-20261104\dist\composition\webchat-intake.test.js:65:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    400 !== 201

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 400
  operator: 'strictEqual'
  ...
# Subtest: intake accepts visibility=customer for CSV file and stores visibility=customer
not ok 2 - intake accepts visibility=customer for CSV file and stores visibility=customer
  ---
  duration_ms: 7.9244
  type: 'test'
  location: 'D:\AI-Workspace\projects\wstera-ai-customer-platform\.worktrees\webchat-intake-20261104\dist\composition\webchat-intake.test.js:78:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    400 !== 201

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 400
  operator: 'strictEqual'
  ...
# Subtest: intake defaults visibility to internal when field is omitted
ok 3 - intake defaults visibility to internal when field is omitted
  ---
  duration_ms: 56.8569
  type: 'test'
  ...
# Subtest: intake rejects invalid visibility with 400 INVALID_KNOWLEDGE_INPUT and writes nothing
not ok 4 - intake rejects invalid visibility with 400 INVALID_KNOWLEDGE_INPUT and writes nothing
  ---
  duration_ms: 6.6578
  type: 'test'
  location: 'D:\AI-Workspace\projects\wstera-ai-customer-platform\.worktrees\webchat-intake-20261104\dist\composition\webchat-intake.test.js:117:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected

      {
    +   error: 'INVALID_FORM_FIELDS'
    -   error: 'INVALID_KNOWLEDGE_INPUT'
      }

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    error: 'INVALID_KNOWLEDGE_INPUT'
  actual:
    error: 'INVALID_FORM_FIELDS'
  operator: 'deepStrictEqual'
  ...
# Subtest: intake rejects unauthenticated request even with visibility and writes nothing
ok 5 - intake rejects unauthenticated request even with visibility and writes nothing
  ---
  duration_ms: 3.5427
  type: 'test'
  ...
# Subtest: retrieval with audience customer sees customer docs and not internal docs
not ok 6 - retrieval with audience customer sees customer docs and not internal docs
  ---
  duration_ms: 5.7754
  type: 'test'
  location: 'D:\AI-Workspace\projects\wstera-ai-customer-platform\.worktrees\webchat-intake-20261104\dist\composition\webchat-intake.test.js:161:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    400 !== 201

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 400
  operator: 'strictEqual'
  ...
# Subtest: createWebChatRoutes throws when messageEndpoint is not an absolute path starting with /
not ok 7 - createWebChatRoutes throws when messageEndpoint is not an absolute path starting with /
  ---
  duration_ms: 1.4355
  type: 'test'
  location: 'D:\AI-Workspace\projects\wstera-ai-customer-platform\.worktrees\webchat-intake-20261104\dist\composition\webchat-intake.test.js:258:1'
  failureType: 'testCodeFailure'
  error: 'Missing expected exception: Expected createWebChatRoutes to throw for messageEndpoint="./message"'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  ...
# Subtest: webchat page renders exact absolute messageEndpoint and integration message fetch succeeds
not ok 8 - webchat page renders exact absolute messageEndpoint and integration message fetch succeeds
  ---
  duration_ms: 3.0184
  type: 'test'
  location: 'D:\AI-Workspace\projects\wstera-ai-customer-platform\.worktrees\webchat-intake-20261104\dist\composition\webchat-intake.test.js:275:1'
  failureType: 'testCodeFailure'
  error: |-
    HTML must not contain old relative fallback './message'

    true !== false

  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: false
  actual: true
  operator: 'strictEqual'
  ...
# Subtest: renderChatPage requires messageEndpoint and injects it verbatim
ok 9 - renderChatPage requires messageEndpoint and injects it verbatim
  ---
  duration_ms: 0.7323
  type: 'test'
  ...
1..9
# tests 9
# suites 0
# pass 3
# fail 6
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2598.5293
```

### 3.2 ผลดิบหลังแก้ (After Codebase)
รันชุดทดสอบใหม่ `dist/composition/webchat-intake.test.js`:
```text
TAP version 13
# Subtest: intake accepts visibility=customer for FAQ and stores visibility=customer
ok 1 - intake accepts visibility=customer for FAQ and stores visibility=customer
  ---
  duration_ms: 1337.5107
  type: 'test'
  ...
# Subtest: intake accepts visibility=customer for CSV file and stores visibility=customer
ok 2 - intake accepts visibility=customer for CSV file and stores visibility=customer
  ---
  duration_ms: 31.8632
  type: 'test'
  ...
# Subtest: intake defaults visibility to internal when field is omitted
ok 3 - intake defaults visibility to internal when field is omitted
  ---
  duration_ms: 42.8164
  type: 'test'
  ...
# Subtest: intake rejects invalid visibility with 400 INVALID_KNOWLEDGE_INPUT and writes nothing
ok 4 - intake rejects invalid visibility with 400 INVALID_KNOWLEDGE_INPUT and writes nothing
  ---
  duration_ms: 17.3064
  type: 'test'
  ...
# Subtest: intake rejects unauthenticated request even with visibility and writes nothing
ok 5 - intake rejects unauthenticated request even with visibility and writes nothing
  ---
  duration_ms: 3.8616
  type: 'test'
  ...
# Subtest: retrieval with audience customer sees customer docs and not internal docs
ok 6 - retrieval with audience customer sees customer docs and not internal docs
  ---
  duration_ms: 65.4365
  type: 'test'
  ...
# Subtest: createWebChatRoutes throws when messageEndpoint is not an absolute path starting with /
ok 7 - createWebChatRoutes throws when messageEndpoint is not an absolute path starting with /
  ---
  duration_ms: 1.6272
  type: 'test'
  ...
# Subtest: webchat page renders exact absolute messageEndpoint and integration message fetch succeeds
ok 8 - webchat page renders exact absolute messageEndpoint and integration message fetch succeeds
  ---
  duration_ms: 3.4408
  type: 'test'
  ...
# Subtest: renderChatPage requires messageEndpoint and injects it verbatim
ok 9 - renderChatPage requires messageEndpoint and injects it verbatim
  ---
  duration_ms: 0.9225
  type: 'test'
  ...
1..9
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1669.5738
```

### 3.3 ผลดิบการรันเต็มระบบ (`npm run check`)
```text
> wstera-ai-customer-platform@0.1.0 check
> npm run typecheck && npm test && npm run build:console

> wstera-ai-customer-platform@0.1.0 typecheck
> tsc --noEmit

> wstera-ai-customer-platform@0.1.0 test
> npm run build && node --test ...

1..243
# tests 297
# suites 0
# pass 297
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 6190.9634

> wstera-ai-customer-platform@0.1.0 build:console
> npm run build && next build --webpack platform/apps/merchant-console

▲ Next.js 16.4.2 (webpack)
✓ Running next.config.ts took 46ms
  Creating an optimized production build ...
✓ Compiled successfully in 1701ms
  Running TypeScript ...
  Finished TypeScript in 2.2s ...
  Collecting page data using 8 workers ...
  Generating static pages using 8 workers (0/2) ...
✓ Generating static pages using 8 workers (2/2) in 659ms
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

---

## 4. ข้อที่ไม่ได้ทำพร้อมเหตุผล (Items not done & Reasons)

1. **การต่อสายโฮสต์จริง (Wiring live host to `createWebChatRoutes`):**
   - ไม่ได้ทำ เนื่องจากไม่มีโฮสต์จริงอยู่ในขอบเขตภารกิจนี้ตามที่บรีฟระบุไว้อย่างชัดเจน ("ตอนนี้ยังไม่มีโฮสต์ที่เรียก `createWebChatRoutes` นอกเทสต์ (โฮสต์จริงเป็นงานต่อสายแยก) ดังนั้นห้ามเขียนในรายงานว่า N1 ปิดทั้งเส้นแล้ว ให้ระบุว่าปิดที่ชั้น API")
2. **การรันเทสต์กับฐานข้อมูล Supabase Hosted หรือ LAB:**
   - ไม่ได้ทำ เนื่องจากเป็นไปตามกฎเหล็กและข้อห้าม ("ห้ามติดต่อ `wstera-lab`/Supabase/บริการจริง ห้ามเรียกโมเดล/เครือข่าย") ทุกการทดสอบรันบน in-memory PGlite
3. **การเปิด PR / Push / Merge / เรียกผู้ตรวจ:**
   - ไม่ได้ทำ เนื่องจากเป็นไปตามข้อห้ามในบรีฟ ("ห้าม push ห้ามเปิด PR ห้าม merge ห้ามเรียกผู้ตรวจ")

---

## 5. การตรวจสอบความปลอดภัยและสุขอนามัยของโค้ด (Hygiene & Security)

- `git diff --check`: ผ่าน (ไม่มี trailing whitespace หรือข้อผิดพลาดทาง whitespace)
- สแกน Git Diff สำหรับคีย์และ Secret: ไม่พบสตริงรูปแบบคีย์, API tokens, หรือโปรเจกต์อ้างอิงจริง
- ไม่มีการแตะต้องไฟล์นอกขอบเขต (`web-chat-host.ts`, `platform/adapters/answers/**`, `platform/modules/ai-engine/**`, migrations, `supabase/**`)

DONE
