import assert from "node:assert/strict";
import test from "node:test";
import { renderChatPage } from "./render-chat-page.js";

test("renderChatPage output contains no occurrences of innerHTML", () => {
  const html = renderChatPage({
    connectionId: "conn-test",
    nonce: "test-nonce-12345",
    messageEndpoint: "/chat/message",
  });

  assert.equal(html.includes("innerHTML"), false, "HTML must never contain the word 'innerHTML'");
});

test("every script and style tag in renderChatPage output has nonce attribute matching parameter", () => {
  const nonce = "custom-secure-nonce-9876";
  const html = renderChatPage({
    connectionId: "conn-test",
    nonce,
    messageEndpoint: "/chat/message",
  });

  // Verify scripts
  const scriptMatches = [...html.matchAll(/<script\b([^>]*)>/gi)];
  assert.ok(scriptMatches.length > 0, "Expected at least one script tag");
  for (const match of scriptMatches) {
    const attrs = match[1] || "";
    assert.match(attrs, new RegExp(`nonce="${nonce}"`), `Script tag missing nonce: ${match[0]}`);
  }

  // Verify styles (rvC 8)
  const styleMatches = [...html.matchAll(/<style\b([^>]*)>/gi)];
  assert.ok(styleMatches.length > 0, "Expected at least one style tag");
  for (const match of styleMatches) {
    const attrs = match[1] || "";
    assert.match(attrs, new RegExp(`nonce="${nonce}"`), `Style tag missing nonce: ${match[0]}`);
  }
});

test("renderChatPage includes accessible landmarks, live region, and buttons", () => {
  const html = renderChatPage({
    connectionId: "conn-accessible",
    nonce: "nonce-abc",
    messageEndpoint: "/chat/message",
  });

  // Language attribute
  assert.match(html, /<html\s+lang="th">/);

  // Accessible landmarks & live region
  assert.match(html, /role="main"/);
  assert.match(html, /role="log"/);
  assert.match(html, /aria-live="polite"/);

  // Accessible form input and labels
  assert.match(html, /<label\s+for="chat-input"/);
  assert.match(html, /id="chat-input"/);

  // Send button and handoff button
  assert.match(html, /id="send-btn"/);
  assert.match(html, /id="handoff-btn"/);
  assert.match(html, /ขอคุยกับพนักงาน/);

  // Injected connectionId is present in client script
  assert.match(html, /conn-accessible/);
});

test("renderChatPage safely escapes connectionId and endpoint against script injection and backslash syntax errors", () => {
  const maliciousId = 'conn" onload="alert(1)" </script><script>alert(2)</script> \\ ';
  const maliciousEndpoint = '/api/chat?test=1&foo=" </script>';
  const html = renderChatPage({
    connectionId: maliciousId,
    nonce: "nonce-safe",
    messageEndpoint: maliciousEndpoint,
  });

  // Extract the contents of <script>
  const scriptContentMatch = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(scriptContentMatch, "Script tag must exist");
  const scriptContent = scriptContentMatch[1]!;

  // Must not contain raw unescaped </script> inside script
  assert.equal(scriptContent.includes("</script>"), false, "Script content must not contain raw </script>");
  assert.equal(scriptContent.includes("<!--"), false, "Script content must not contain raw <!--");

  // Must parse as valid JavaScript without SyntaxError
  assert.doesNotThrow(() => {
    new Function(scriptContent);
  }, "Script content must be valid JavaScript syntax");

  // Must not have any inline event handlers (rvC 8)
  assert.equal(/<[a-z0-9-]+\s+[^>]*\bon[a-z]+\s*=/i.test(html), false, "HTML must contain no inline event handlers like onclick or onload");
});

test("welcome bubble is one tight line because the bubble uses pre-wrap", () => {
  const html = renderChatPage({ connectionId: "c", nonce: "n", messageEndpoint: "/m" });
  assert.match(html, /<div class="message-item message-bot">สวัสดีครับ[^<\n]*ครับ<\/div>/u);
});

/** Runs the page script against a tiny fake DOM to exercise history, citations and the handoff lock. */
function runPage(storage: Map<string, string> | null, fetchReply: unknown, server: { handoffOpen?: boolean; pollFails?: boolean } = {}): Record<string, any> {
  const html = renderChatPage({ connectionId: "conn-1", nonce: "n", messageEndpoint: "/m" });
  const script = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(html)![1]!;
  const make = (): Record<string, any> => {
    const el: Record<string, any> = { children: [], listeners: {}, attrs: {}, textContent: "", value: "", disabled: false };
    el.appendChild = (child: unknown) => { el.children.push(child); };
    el.addEventListener = (name: string, fn: unknown) => { el.listeners[name] = fn; };
    el.setAttribute = (k: string, v: string) => { el.attrs[k] = v; };
    el.removeAttribute = (k: string) => { delete el.attrs[k]; };
    Object.defineProperty(el, "childNodes", { get: () => el.children });
    el.focus = () => {};
    return el;
  };
  const ids = ["messages", "chat-form", "chat-input", "send-btn", "handoff-btn"];
  const els: Record<string, any> = Object.fromEntries(ids.map((id) => [id, make()]));
  const document = { visibilityState: "visible", addEventListener() {}, getElementById: (id: string) => els[id], createElement: () => make() };
  const sessionStorage = storage === null ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } } : {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); },
  };
  const fetch = async (url: string, init: { body: string }) => {
    if (url.startsWith("/chat/updates")) {
      if (server.pollFails) throw new Error("offline");
      return { ok: true, status: 200, json: async () => ({ data: [], cursor: null, handoffOpen: server.handoffOpen === true }) };
    }
    return { ok: true, status: 200, json: async () => (init.body.includes("handoff") ? { kind: "handoff_recorded" } : fetchReply) };
  };
  let tick: () => void = () => {};
  new Function("document", "sessionStorage", "fetch", "AbortController", "setTimeout", "clearTimeout", "setInterval", script)(
    document, sessionStorage, fetch, AbortController, setTimeout, clearTimeout, (fn: () => void) => { tick = fn; return { unref() {} }; },
  );
  els["poll"] = async () => { tick(); await new Promise((r) => setImmediate(r)); };
  return els;
}

const texts = (els: Record<string, any>) => els["messages"].children.map((c: any) => c.textContent);

test("page script: citations show title only, once, and history survives a refresh", async () => {
  const storage = new Map<string, string>();
  const first: Record<string, any> = runPage(storage, {
    kind: "answer",
    text: "ตอบ",
    citations: [{ title: "วิธีชำระเงิน" }, { title: "วิธีชำระเงิน" }, { title: "การรับประกัน" }],
  });
  first["chat-input"].value = "ถาม";
  await first["chat-form"].listeners["submit"]({ preventDefault() {} });
  const bot = first["messages"].children[1];
  assert.deepEqual(bot.children[0].children.map((c: any) => c.textContent), ["ที่มา: วิธีชำระเงิน", "ที่มา: การรับประกัน"]);

  await first["handoff-btn"].listeners["click"]();
  assert.equal(first["handoff-btn"].disabled, true);
  assert.equal(storage.size, 1);
  assert.equal("h" in JSON.parse([...storage.values()][0]!), false);
  assert.ok([...storage.keys()][0]!.endsWith("conn-1"));

  // "refresh": new page, same storage
  const second = runPage(storage, {});
  assert.deepEqual(texts(second).slice(0, 2), ["ถาม", "ตอบ"]);
});

test("page script: the handoff button follows handoffOpen from the server poll", async () => {
  const server = { handoffOpen: true, pollFails: false };
  const page = runPage(new Map(), {}, server);
  await page["poll"]();
  assert.equal(page["handoff-btn"].disabled, true);
  // staff released the chat and the customer typed nothing: the next poll alone unlocks it
  server.handoffOpen = false;
  await page["poll"]();
  assert.equal(page["handoff-btn"].disabled, false);
  // a failed poll leaves the button as it was
  server.handoffOpen = true;
  await page["poll"]();
  server.pollFails = true;
  server.handoffOpen = false;
  await page["poll"]();
  assert.equal(page["handoff-btn"].disabled, true);
});

test("page script: a refresh takes the button state from the poll, not from storage", async () => {
  const storage = new Map<string, string>();
  const first = runPage(storage, {}, { handoffOpen: true });
  await first["handoff-btn"].listeners["click"]();
  assert.equal(first["handoff-btn"].disabled, true);
  // old clients stored h:true; it is ignored
  const key = [...storage.keys()][0]!;
  storage.set(key, JSON.stringify({ ...JSON.parse(storage.get(key)!), h: true }));
  const released = runPage(storage, {}, { handoffOpen: false });
  await released["poll"]();
  assert.equal(released["handoff-btn"].disabled, false);
  const stillOpen = runPage(storage, {}, { handoffOpen: true });
  await stillOpen["poll"]();
  assert.equal(stillOpen["handoff-btn"].disabled, true);
});

test("page script: works with blocked storage, caps stored history at 50, and never stores connection errors", async () => {
  const blocked = runPage(null, { kind: "greeting", text: "สวัสดีครับ" });
  blocked["chat-input"].value = "สวัสดี";
  await blocked["chat-form"].listeners["submit"]({ preventDefault() {} });
  assert.deepEqual(texts(blocked), ["สวัสดี", "สวัสดีครับ"]);

  const storage = new Map<string, string>();
  const page = runPage(storage, { kind: "greeting", text: "x" });
  for (let i = 0; i < 30; i += 1) {
    page["chat-input"].value = `q${i}`;
    await page["chat-form"].listeners["submit"]({ preventDefault() {} });
  }
  assert.equal(JSON.parse([...storage.values()][0]!).m.length, 50);
});
