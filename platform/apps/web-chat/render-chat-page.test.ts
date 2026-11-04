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

test("every script and style tag in renderChatPage output has nonce attribute matching parameter", () => {
  const nonce = "custom-secure-nonce-9876";
  const html = renderChatPage({
    connectionId: "conn-test",
    nonce,
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
