export type RenderChatPageParams = Readonly<{
  connectionId: string;
  nonce: string;
  messageEndpoint: string;
}>;

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeJsStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Renders the Thai visitor chat page.
 * Uses only textContent for dynamic content rendering; never uses innerHTML.
 * Ensures strict accessibility, timeout handling, and context-aware escaping.
 */
export function renderChatPage(params: RenderChatPageParams): string {
  const safeNonce = escapeHtmlAttr(params.nonce);
  const jsConnectionId = escapeJsStringLiteral(params.connectionId);
  const jsEndpoint = escapeJsStringLiteral(params.messageEndpoint);

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>ระบบสนทนาสอบถามข้อมูล</title>
  <style nonce="${safeNonce}">
    :root {
      --bg-base: #f5f5f7;
      --surface: #ffffff;
      --surface-2: #e8e8ed;
      --text: #1d1d1f;
      --text-2: #515154;
      --text-3: #6e6e73;
      --blue: #0071e3;
      --blue-hover: #0062c4;
      --hairline: rgba(0, 0, 0, 0.12);
      --staff-bg: #e8f5ec;
      --staff-border: #b4dcc2;
      --staff-badge: #1b6a38;
      --radius-bubble: 20px;
      --ease: cubic-bezier(0.25, 1, 0.5, 1);
      --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Leelawadee UI", "Thonburi", "Noto Sans Thai", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      font-family: var(--font);
      background-color: var(--bg-base);
      color: var(--text);
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }
    button, input { font-family: inherit; }
    :focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; }
    header {
      background-color: rgba(245, 245, 247, 0.85);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      backdrop-filter: saturate(180%) blur(20px);
      border-bottom: 1px solid var(--hairline);
      padding: 8px 16px;
      padding-top: max(8px, env(safe-area-inset-top));
      padding-left: max(16px, env(safe-area-inset-left));
      padding-right: max(16px, env(safe-area-inset-right));
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    header h1 {
      font-size: 1.0625rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.35;
      min-width: 0;
    }
    .header-actions { flex-shrink: 0; }
    .btn {
      min-height: 44px;
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 0.875rem;
      font-weight: 600;
      line-height: 1.3;
      cursor: pointer;
      border: 1px solid var(--hairline);
      transition: background-color 200ms var(--ease), border-color 200ms var(--ease);
    }
    .btn-handoff { background-color: var(--surface); color: var(--text); }
    .btn-handoff:hover:not(:disabled) { background-color: var(--surface-2); }
    .btn-handoff .label-done { display: none; }
    .btn-handoff:disabled {
      cursor: default;
      background-color: var(--staff-bg);
      border-color: var(--staff-border);
      color: var(--staff-badge);
    }
    .btn-handoff:disabled .label-idle { display: none; }
    .btn-handoff:disabled .label-done { display: inline; }
    main {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
      background-color: var(--bg-base);
    }
    .messages-area {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 16px;
      padding-left: max(16px, env(safe-area-inset-left));
      padding-right: max(16px, env(safe-area-inset-right));
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .message-item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
      max-width: 85%;
      padding: 10px 16px;
      border-radius: var(--radius-bubble);
      font-size: 1rem;
      line-height: 1.6;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .message-user {
      align-self: flex-end;
      background-color: var(--blue);
      color: #ffffff;
      border-bottom-right-radius: 6px;
    }
    .message-bot {
      align-self: flex-start;
      background-color: var(--surface);
      color: var(--text);
      border: 1px solid var(--hairline);
      border-bottom-left-radius: 6px;
    }
    .message-staff {
      align-self: flex-start;
      background-color: var(--staff-bg);
      color: var(--text);
      border: 1px solid var(--staff-border);
      border-bottom-left-radius: 6px;
    }
    .staff-badge {
      order: -1;
      align-self: flex-start;
      margin-bottom: 4px;
      padding: 1px 10px;
      border-radius: 999px;
      background-color: var(--staff-badge);
      color: #ffffff;
      font-size: 0.75rem;
      font-weight: 700;
      line-height: 1.6;
      white-space: nowrap;
    }
    .citation-list {
      align-self: stretch;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--hairline);
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .citation-chip {
      max-width: 100%;
      font-size: 0.8125rem;
      line-height: 1.5;
      background-color: var(--bg-base);
      border: 1px solid var(--hairline);
      color: var(--text-2);
      padding: 1px 10px;
      border-radius: 999px;
      overflow-wrap: anywhere;
    }
    .typing {
      display: none;
      align-items: center;
      gap: 8px;
      margin: 0 16px 8px;
      padding: 8px 14px;
      align-self: flex-start;
      border: 1px solid var(--hairline);
      border-radius: 999px;
      background-color: var(--surface);
      color: var(--text-2);
      font-size: 0.875rem;
    }
    main:has(#send-btn:disabled) .typing { display: flex; }
    .typing-dots { display: inline-flex; gap: 4px; }
    .typing-dots i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--text-3);
      opacity: 0.6;
    }
    @media (prefers-reduced-motion: no-preference) {
      .typing-dots i { animation: dot-pulse 1.2s var(--ease) infinite; }
      .typing-dots i:nth-child(2) { animation-delay: 0.2s; }
      .typing-dots i:nth-child(3) { animation-delay: 0.4s; }
      @keyframes dot-pulse {
        0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
        40% { opacity: 1; transform: translateY(-3px); }
      }
    }
    .input-area {
      padding: 10px 16px;
      padding-bottom: max(10px, env(safe-area-inset-bottom));
      padding-left: max(16px, env(safe-area-inset-left));
      padding-right: max(16px, env(safe-area-inset-right));
      border-top: 1px solid var(--hairline);
      display: flex;
      gap: 8px;
      background-color: rgba(255, 255, 255, 0.9);
      flex-shrink: 0;
    }
    .input-wrapper { flex: 1; min-width: 0; }
    .chat-input {
      width: 100%;
      min-height: 44px;
      padding: 10px 16px;
      border: 1px solid var(--hairline);
      border-radius: 999px;
      background-color: var(--surface);
      color: var(--text);
      font-size: 1rem;
    }
    .chat-input::placeholder { color: var(--text-3); }
    .chat-input:focus-visible { border-color: var(--blue); outline-offset: 0; }
    .send-button {
      min-width: 64px;
      min-height: 44px;
      padding: 10px 20px;
      background-color: var(--blue);
      color: #ffffff;
      border: none;
      border-radius: 999px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      flex-shrink: 0;
      transition: background-color 200ms var(--ease);
    }
    .send-button:hover:not(:disabled) { background-color: var(--blue-hover); }
    .send-button:disabled { background-color: var(--surface-2); color: var(--text-3); cursor: not-allowed; }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  </style>
</head>
<body>
  <header>
    <h1>ระบบสนทนาช่วยเหลือลูกค้า</h1>
    <div class="header-actions">
      <button
        type="button"
        id="handoff-btn"
        class="btn btn-handoff"
      >
        <span class="label-idle">ขอคุยกับพนักงาน</span>
        <span class="label-done">ส่งเรื่องแล้ว รอพนักงานตอบ</span>
      </button>
    </div>
  </header>

  <main role="main">
    <div
      id="messages"
      class="messages-area"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="ประวัติการสนทนา"
    >
      <div class="message-item message-bot">สวัสดีครับ ยินดีต้อนรับสู่ระบบบริการลูกค้า มีอะไรให้ช่วยเหลือสามารถพิมพ์สอบถามได้เลยครับ</div>
    </div>

    <div class="typing" role="status">
      <span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span>กำลังหาคำตอบ…</span>
    </div>

    <form id="chat-form" class="input-area" action="#" method="post">
      <div class="input-wrapper">
        <label for="chat-input" class="sr-only">ข้อความสอบถาม</label>
        <input
          type="text"
          id="chat-input"
          class="chat-input"
          placeholder="พิมพ์ข้อความที่ต้องการสอบถาม..."
          autocomplete="off"
          required
          maxlength="5000"
        >
      </div>
      <button type="submit" id="send-btn" class="send-button" aria-label="ส่งข้อความ">
        ส่ง
      </button>
    </form>
  </main>

  <script nonce="${safeNonce}">
    (function () {
      const connectionId = ${jsConnectionId};
      const messageEndpoint = ${jsEndpoint};
      const REQUEST_TIMEOUT_MS = 15000;
      const messagesContainer = document.getElementById("messages");
      const chatForm = document.getElementById("chat-form");
      const chatInput = document.getElementById("chat-input");
      const sendBtn = document.getElementById("send-btn");
      const handoffBtn = document.getElementById("handoff-btn");
      let updateCursor = null;
      const seenStaffMessages = new Set();
      // A poll answer is stale if a handoff request started or finished after the poll began, or is still in flight.
      let handoffGen = 0;
      let handoffInFlight = 0;

      const STORAGE_KEY = "aicp-webchat:" + connectionId;
      const MAX_STORED_MESSAGES = 50;
      const state = { m: [] };

      function saveState() {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (err) { /* storage unavailable: the chat still works, it just will not survive a refresh */ }
      }

      // persist=false for connection errors, which must not come back after a refresh.
      // staffId keeps a staff message in its place in the stored history and lets the poll skip it after a refresh.
      function appendMessage(text, isUser, citations, persist, staffId) {
        const item = document.createElement("div");
        const isStaff = typeof staffId === "string";
        item.className = isUser ? "message-item message-user" : isStaff ? "message-item message-staff" : "message-item message-bot";
        item.textContent = text;
        if (isStaff) {
          const badge = document.createElement("span");
          badge.className = "staff-badge";
          badge.textContent = "พนักงาน";
          item.appendChild(badge);
        }

        const titles = [];
        if (Array.isArray(citations)) {
          citations.forEach(function (cit) {
            if (cit && typeof cit.title === "string" && titles.indexOf(cit.title) < 0) titles.push(cit.title);
          });
        }
        if (titles.length > 0) {
          const citationContainer = document.createElement("div");
          citationContainer.className = "citation-list";
          citationContainer.setAttribute("aria-label", "แหล่งที่มาอ้างอิง");
          titles.forEach(function (title) {
            const chip = document.createElement("span");
            chip.className = "citation-chip";
            chip.textContent = "ที่มา: " + title;
            citationContainer.appendChild(chip);
          });
          item.appendChild(citationContainer);
        }

        messagesContainer.appendChild(item);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        if (persist !== false) {
          state.m.push(typeof staffId === "string" ? [text, 0, titles, staffId] : [text, isUser ? 1 : 0, titles]);
          if (state.m.length > MAX_STORED_MESSAGES) state.m.splice(0, state.m.length - MAX_STORED_MESSAGES);
          saveState();
        }
      }

      try {
        const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
        if (saved && Array.isArray(saved.m)) {
          saved.m.slice(-MAX_STORED_MESSAGES).forEach(function (entry) {
            if (Array.isArray(entry) && typeof entry[0] === "string") {
              if (typeof entry[3] === "string") seenStaffMessages.add(entry[3]);
              appendMessage(entry[0], entry[1] === 1, Array.isArray(entry[2]) ? entry[2].filter(function (t) { return typeof t === "string"; }).map(function (t) { return { title: t }; }) : [], true, typeof entry[3] === "string" ? entry[3] : undefined);
            }
          });
        }
      } catch (err) { /* ignore unreadable saved chat */ }

      chatForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.value = "";
        appendMessage(text, true);
        sendBtn.disabled = true;
        messagesContainer.setAttribute("aria-busy", "true");

        const controller = new AbortController();
        const timeoutId = setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch(messageEndpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ connectionId: connectionId, text: text }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const data = await response.json();
          if (response.ok) {
            if (data.kind === "answer") {
              appendMessage(data.text || "", false, data.citations);
            } else if (data.kind === "uncertain") {
              appendMessage(data.text || "ขออภัยครับ ไม่พบข้อมูลที่ยืนยันได้ สามารถกดปุ่มขอคุยกับพนักงานได้ครับ", false);
              if (data.handoff === true) { handoffGen += 1; handoffBtn.disabled = true; }
            } else {
              appendMessage(data.text || "ได้รับข้อความแล้ว", false);
            }
          } else {
            // Map HTTP status codes to polite Thai messages without exposing internal error codes
            let errorMessage = "ไม่สามารถส่งข้อความได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";
            if (response.status === 401) {
              errorMessage = "เซสชันการสนทนาหมดอายุ กรุณาโหลดหน้าใหม่เพื่อเริ่มการสนทนา";
            } else if (response.status === 429) {
              errorMessage = "ส่งข้อความถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง";
            } else if (response.status === 409) {
              errorMessage = "สถานะการสนทนามีการเปลี่ยนแปลง กรุณาส่งข้อความใหม่อีกครั้ง";
            } else if (response.status === 413) {
              errorMessage = "ข้อความมีขนาดยาวเกินกำหนด กรุณาลดความยาวข้อความ";
            } else if (response.status === 503) {
              errorMessage = "ระบบไม่สามารถให้บริการได้ในขณะนี้ กรุณาลองใหม่ในภายหลัง";
            }
            appendMessage(errorMessage, false, undefined, false);
          }
        } catch (err) {
          clearTimeout(timeoutId);
          if (err && err.name === "AbortError") {
            appendMessage("การเชื่อมต่อใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง", false, undefined, false);
          } else {
            appendMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง", false, undefined, false);
          }
        } finally {
          messagesContainer.removeAttribute("aria-busy");
          sendBtn.disabled = false;
          chatInput.focus();
        }
      });

      handoffBtn.addEventListener("click", async function () {
        handoffBtn.disabled = true;
        handoffInFlight += 1;
        handoffGen += 1;
        let sent = false;
        messagesContainer.setAttribute("aria-busy", "true");

        const controller = new AbortController();
        const timeoutId = setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT_MS);

        try {
          const response = await fetch(messageEndpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ connectionId: connectionId, action: "handoff" }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const data = await response.json();
          if (response.ok && data.kind === "handoff_recorded") {
            appendMessage("ส่งคำขอคุยกับพนักงานเรียบร้อยแล้วครับ เจ้าหน้าที่จะติดต่อกลับโดยเร็ว", false);
            sent = true;
          } else {
            appendMessage("ไม่สามารถส่งคำขอคุยกับพนักงานได้ในขณะนี้", false, undefined, false);
          }
        } catch (err) {
          clearTimeout(timeoutId);
          if (err && err.name === "AbortError") {
            appendMessage("การเชื่อมต่อใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง", false, undefined, false);
          } else {
            appendMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง", false, undefined, false);
          }
        } finally {
          messagesContainer.removeAttribute("aria-busy");
          handoffInFlight -= 1;
          handoffGen += 1;
          if (!sent) handoffBtn.disabled = false;
        }
      });

      async function pollStaffMessages() {
        if (document.visibilityState !== "visible") return;
        const gen = handoffGen;
        const suffix = updateCursor ? "?after=" + encodeURIComponent(updateCursor) : "";
        try {
          const response = await fetch("/chat/updates" + suffix, { method: "GET", cache: "no-store" });
          if (!response.ok) return;
          const result = await response.json();
          if (!result || !Array.isArray(result.data)) return;
          result.data.forEach(function (message) {
            if (!message || typeof message.id !== "string" || typeof message.text !== "string" || seenStaffMessages.has(message.id)) return;
            seenStaffMessages.add(message.id);
            appendMessage(message.text, false, undefined, true, message.id);
          });
          if (typeof result.handoffOpen === "boolean" && gen === handoffGen && handoffInFlight === 0) handoffBtn.disabled = result.handoffOpen;
          if (typeof result.cursor === "string") updateCursor = result.cursor;
        } catch (err) { /* polling resumes on the next interval */ }
      }
      const updatesTimer = setInterval(function () {
        if (document.visibilityState === "visible") void pollStaffMessages();
      }, 5000);
      if (updatesTimer && typeof updatesTimer.unref === "function") updatesTimer.unref();
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") void pollStaffMessages();
      });
      void pollStaffMessages();
    })();
  </script>
</body>
</html>`;
}
