export type RenderChatPageParams = Readonly<{
  connectionId: string;
  nonce: string;
  messageEndpoint?: string;
}>;

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Renders the Thai visitor chat page.
 * Uses only textContent for dynamic content rendering; never uses innerHTML.
 * Ensures strict accessibility and keyboard navigation.
 */
export function renderChatPage(params: RenderChatPageParams): string {
  const safeConnectionId = escapeHtmlAttr(params.connectionId);
  const safeNonce = escapeHtmlAttr(params.nonce);
  const safeEndpoint = escapeHtmlAttr(params.messageEndpoint ?? "./message");

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
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 12px;
    }
    .chat-container {
      width: 100%;
      max-width: 640px;
      height: 90vh;
      max-height: 800px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    header {
      padding: 16px;
      background: #ffffff;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    header h1 {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-main);
    }
    .handoff-button {
      background-color: var(--handoff-btn);
      color: #ffffff;
      border: none;
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .handoff-button:hover, .handoff-button:focus {
      background-color: var(--handoff-hover);
      outline: 2px solid var(--handoff-hover);
      outline-offset: 2px;
    }
    .messages-area {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message-item {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 8px;
      line-height: 1.5;
      font-size: 0.95rem;
      word-break: break-word;
    }
    .message-user {
      align-self: flex-end;
      background-color: var(--user-bubble);
      color: var(--text-main);
    }
    .message-bot {
      align-self: flex-start;
      background-color: var(--bot-bubble);
      color: var(--text-main);
      border: 1px solid var(--border);
    }
    .citation-list {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .citation-chip {
      display: inline-block;
      font-size: 0.75rem;
      background: var(--chip-bg);
      border: 1px solid var(--chip-border);
      color: var(--chip-text);
      padding: 2px 8px;
      border-radius: 12px;
    }
    form.input-area {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: #ffffff;
      border-top: 1px solid var(--border);
    }
    .input-wrapper {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .visually-hidden {
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
    input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 0.95rem;
      outline: none;
    }
    input[type="text"]:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
    }
    .send-button {
      background-color: var(--primary);
      color: #ffffff;
      border: none;
      padding: 0 18px;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    .send-button:hover, .send-button:focus {
      background-color: var(--primary-hover);
      outline: 2px solid var(--primary-hover);
      outline-offset: 2px;
    }
    .send-button:disabled, .handoff-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <main class="chat-container" role="main" aria-label="ห้องแชตผู้เยี่ยมชม">
    <header>
      <h1>สอบถามข้อมูลสินค้าและบริการ</h1>
      <button type="button" id="handoff-btn" class="handoff-button" aria-label="ขอคุยกับพนักงานเจ้าหน้าที่">
        ขอคุยกับพนักงาน
      </button>
    </header>

    <div id="messages" class="messages-area" role="log" aria-live="polite" aria-atomic="false">
      <div class="message-item message-bot">
        สวัสดีครับ สอบถามข้อมูลได้เลยครับ หรือสามารถกดปุ่มขอคุยกับพนักงานได้ตลอดเวลา
      </div>
    </div>

    <form id="chat-form" class="input-area" action="#" method="post">
      <div class="input-wrapper">
        <label for="chat-input" class="visually-hidden">พิมพ์ข้อความของคุณ</label>
        <input
          type="text"
          id="chat-input"
          name="text"
          placeholder="พิมพ์ข้อความของคุณ..."
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
      const connectionId = "${safeConnectionId}";
      const messageEndpoint = "${safeEndpoint}";
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

        try {
          const response = await fetch(messageEndpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ connectionId: connectionId, text: text }),
          });

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
            appendMessage("ไม่สามารถส่งข้อความได้ในขณะนี้ (" + (data.error || response.status) + ")", false);
          }
        } catch (err) {
          appendMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง", false);
        } finally {
          sendBtn.disabled = false;
          chatInput.focus();
        }
      });

      handoffBtn.addEventListener("click", async function () {
        handoffBtn.disabled = true;
        try {
          const response = await fetch(messageEndpoint, {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({ connectionId: connectionId, action: "handoff" }),
          });

          const data = await response.json();
          if (response.ok && data.kind === "handoff_recorded") {
            appendMessage("ส่งคำขอคุยกับพนักงานเรียบร้อยแล้วครับ เจ้าหน้าที่จะติดต่อกลับโดยเร็ว", false);
          } else {
            appendMessage("ไม่สามารถส่งคำขอคุยกับพนักงานได้ในขณะนี้", false);
          }
        } catch (err) {
          appendMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง", false);
        } finally {
          handoffBtn.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`;
}
