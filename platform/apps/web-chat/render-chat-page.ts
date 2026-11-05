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
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ระบบสนทนาสอบถามข้อมูล</title>
  <style nonce="${safeNonce}">
    :root {
      --bg-color: #f8fafc;
      --card-bg: #ffffff;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --primary: #0284c7;
      --primary-hover: #0369a1;
      --border: #e2e8f0;
      --user-bubble: #e0f2fe;
      --bot-bubble: #f1f5f9;
      --chip-bg: #f8fafc;
      --chip-border: #cbd5e1;
      --chip-text: #334155;
      --handoff-btn: #f59e0b;
      --handoff-hover: #d97706;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    header {
      background-color: var(--card-bg);
      border-bottom: 1px solid var(--border);
      padding: 12px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    header h1 {
      font-size: 1.125rem;
      font-weight: 600;
    }
    .header-actions {
      display: flex;
      gap: 10px;
    }
    .btn {
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background-color 0.15s ease-in-out;
    }
    .btn-handoff {
      background-color: var(--handoff-btn);
      color: #ffffff;
    }
    .btn-handoff:hover:not(:disabled) {
      background-color: var(--handoff-hover);
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-width: 800px;
      width: 100%;
      margin: 0 auto;
      background-color: var(--card-bg);
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
    }
    .messages-area {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .message-item {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 0.9375rem;
      line-height: 1.5;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .message-user {
      align-self: flex-end;
      background-color: var(--user-bubble);
      color: var(--text-main);
      border-bottom-right-radius: 2px;
    }
    .message-bot {
      align-self: flex-start;
      background-color: var(--bot-bubble);
      color: var(--text-main);
      border-bottom-left-radius: 2px;
    }
    .citation-list {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .citation-chip {
      font-size: 0.75rem;
      background-color: var(--chip-bg);
      border: 1px solid var(--chip-border);
      color: var(--chip-text);
      padding: 2px 8px;
      border-radius: 12px;
    }
    .input-area {
      padding: 16px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 10px;
      background-color: var(--card-bg);
      flex-shrink: 0;
    }
    .input-wrapper {
      flex: 1;
      position: relative;
    }
    .chat-input {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 0.9375rem;
      outline: none;
    }
    .chat-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
    }
    .send-button {
      padding: 10px 20px;
      background-color: var(--primary);
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      flex-shrink: 0;
    }
    .send-button:hover:not(:disabled) {
      background-color: var(--primary-hover);
    }
    .send-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
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
        aria-label="ขอคุยกับเจ้าหน้าที่พนักงาน"
      >
        ขอคุยกับพนักงาน
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
        item.className = isUser ? "message-item message-user" : "message-item message-bot";
        item.textContent = text;

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
