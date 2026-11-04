import assert from "node:assert/strict";
import test from "node:test";
import { renderChatPage } from "./render-chat-page.js";

test("renderChatPage output contains no occurrences of innerHTML", () => {
  const html = renderChatPage({
    connectionId: "conn-test",
    nonce: "test-nonce-12345",
  });

  assert.equal(html.includes("innerHTML"), false, "HTML must never contain the word 'innerHTML'");
});

test("every script tag in renderChatPage output has nonce attribute matching parameter", () => {
  const nonce = "custom-secure-nonce-9876";
  const html = renderChatPage({
    connectionId: "conn-test",
    nonce,
  });

  const scriptMatches = [...html.matchAll(/<script\b([^>]*)>/gi)];
  assert.ok(scriptMatches.length > 0, "Expected at least one script tag");

  for (const match of scriptMatches) {
    const attrs = match[1] || "";
    assert.match(attrs, new RegExp(`nonce="${nonce}"`), `Script tag missing nonce: ${match[0]}`);
  }
});

test("renderChatPage includes accessible landmarks, live region, and buttons", () => {
  const html = renderChatPage({
    connectionId: "conn-accessible",
    nonce: "nonce-abc",
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
