const MODEL = "deepseek-v4.1-flash:1017";
const ENDPOINT = "https://ollama.com/v1/chat/completions";
const HARD_MAX_CALLS = 60;
const MAX_COMPLETION_TOKENS = 50;

export function newLedger() {
  return new Map([1, 2, 3].map((shop) => [shop, { attempts: 0, settled: 0, inputTokens: 0, outputTokens: 0, unknownUsage: 0, failed: 0 }]));
}

export function recordAttempt(ledger, shop, usage, ok) {
  const row = ledger.get(shop);
  if (!row) throw new Error("UNKNOWN_SYNTHETIC_SHOP");
  row.attempts += 1;
  if (!ok) { row.failed += 1; return; }
  row.settled += 1;
  const input = Number.isSafeInteger(usage?.prompt_tokens) && usage.prompt_tokens >= 0 ? usage.prompt_tokens : null;
  const output = Number.isSafeInteger(usage?.completion_tokens) && usage.completion_tokens >= 0 ? usage.completion_tokens : null;
  if (input === null || output === null) { row.unknownUsage += 1; return; }
  row.inputTokens += input;
  row.outputTokens += output;
}

export function hasUsage(usage) {
  return Number.isSafeInteger(usage?.prompt_tokens) && Number.isSafeInteger(usage?.completion_tokens);
}

async function parseStream(response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let finalUsage = null;
  for (;;) {
    const { done, value } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        if (chunk.usage) finalUsage = chunk.usage;
      } catch { /* Ignore malformed/non-JSON event data without logging it. */ }
    }
    if (done) break;
  }
  return finalUsage;
}

function safeErrorCode(error) {
  if (error?.name === "AbortError") return "TIMEOUT";
  if (error instanceof TypeError) return "NETWORK_ERROR";
  return "REQUEST_ERROR";
}

async function request(shop, key, stream, ledger) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: "Reply with a short greeting." }],
        max_completion_tokens: MAX_COMPLETION_TOKENS,
        max_tokens: MAX_COMPLETION_TOKENS,
        stream,
        ...(stream ? { stream_options: { include_usage: true } } : {}),
      }),
    });
    const headerNames = [...response.headers.keys()].filter((name) => /rate|limit|usage/i.test(name)).sort();
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      recordAttempt(ledger, shop, null, false);
      return { shop, stream, status: response.status, usage: null, usagePresent: false, headerNames, error: "HTTP_ERROR" };
    }
    let usage;
    if (stream) usage = await parseStream(response);
    else {
      const body = await response.json();
      usage = body?.usage ?? null;
    }
    recordAttempt(ledger, shop, usage, true);
    return { shop, stream, status: response.status, usage, usagePresent: hasUsage(usage), headerNames, error: null };
  } catch (error) {
    recordAttempt(ledger, shop, null, false);
    return { shop, stream, status: null, usage: null, usagePresent: false, headerNames: [], error: safeErrorCode(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const ledger = newLedger();
  const keys = [1, 2, 3].map((n) => process.env[`OLLAMA_API_KEY_AICP_TEST_${n}`]);
  if (keys.some((key) => !key)) {
    console.error("B13_BLOCKED: required test key env missing");
    process.exitCode = 2;
    return;
  }
  // Unequal synthetic traffic: shop 1 gets one request, shop 2 gets two, shop 3 gets three.
  const schedule = process.argv.includes("--cap-probe") ? [[1, false]] : [
    [1, false],
    [2, true], [2, false],
    [3, false], [3, true], [3, false],
  ];
  if (schedule.length > HARD_MAX_CALLS) throw new Error("HARDCAP_VIOLATION");
  const results = [];
  let streak = 0;
  for (const [shop, stream] of schedule) {
    const result = await request(shop, keys[shop - 1], stream, ledger);
    results.push(result);
    streak = result.status === 429 || (result.status !== null && result.status >= 500) ? streak + 1 : 0;
    if (streak >= 3) break;
  }
  const rows = [...ledger].map(([shop, counts]) => ({ shop: `synthetic-${shop}`, ...counts }));
  const providerByShop = [1, 2, 3].map((shop) => {
    const calls = results.filter((r) => r.shop === shop);
    return {
      shop: `synthetic-${shop}`,
      attempts: calls.length,
      returnedUsageCalls: calls.filter((r) => r.usagePresent).length,
      inputTokens: calls.reduce((sum, r) => sum + (Number.isSafeInteger(r.usage?.prompt_tokens) ? r.usage.prompt_tokens : 0), 0),
      outputTokens: calls.reduce((sum, r) => sum + (Number.isSafeInteger(r.usage?.completion_tokens) ? r.usage.completion_tokens : 0), 0),
    };
  });
  console.log(JSON.stringify({ model: MODEL, endpoint: "https://ollama.com/v1", maxCompletionTokens: MAX_COMPLETION_TOKENS, maxCalls: HARD_MAX_CALLS, attemptedThisRun: results.length, results, ledger: rows, providerByShop }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

