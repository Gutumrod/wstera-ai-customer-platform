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
      <div class="message-item message-bot">
        สวัสดีครับ ยินดีต้อนรับสู่ระบบบริการลูกค้า มีอะไรให้ช่วยเหลือสามารถพิมพ์สอบถามได้เลยครับ
      </div>
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

      function appendMessage(text, isUser, citations) {
        const item = document.createElement("div");
        item.className = isUser ? "message-item message-user" : "message-item message-bot";
        item.textContent = text;

        if (Array.isArray(citations) && citations.length > 0) {
          const citationContainer = document.createElement("div");
          citationContainer.className = "citation-list";
          citationContainer.setAttribute("aria-label", "แหล่งที่มาอ้างอิง");

          citations.forEach(function (cit) {
            if (!cit || typeof cit.title !== "string") return;
            const chip = document.createElement("span");
            chip.className = "citation-chip";
            let label = cit.title;
            if (cit.sourceVersionId) {
              label += " (" + cit.sourceVersionId + ")";
            }
            if (cit.position) {
              label += " " + cit.position;
            }
            chip.textContent = label;
            citationContainer.appendChild(chip);
          });

          if (citationContainer.childNodes.length > 0) {
            item.appendChild(citationContainer);
          }
        }

        messagesContainer.appendChild(item);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }

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
            appendMessage(errorMessage, false);
          }
        } catch (err) {
          clearTimeout(timeoutId);
          if (err && err.name === "AbortError") {
            appendMessage("การเชื่อมต่อใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง", false);
          } else {
            appendMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง", false);
          }
        } finally {
          messagesContainer.removeAttribute("aria-busy");
          sendBtn.disabled = false;
          chatInput.focus();
        }
      });

      handoffBtn.addEventListener("click", async function () {
        handoffBtn.disabled = true;
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
          } else {
            appendMessage("ไม่สามารถส่งคำขอคุยกับพนักงานได้ในขณะนี้", false);
          }
        } catch (err) {
          clearTimeout(timeoutId);
          if (err && err.name === "AbortError") {
            appendMessage("การเชื่อมต่อใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง", false);
          } else {
            appendMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง", false);
          }
        } finally {
          messagesContainer.removeAttribute("aria-busy");
          handoffBtn.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`;
}
