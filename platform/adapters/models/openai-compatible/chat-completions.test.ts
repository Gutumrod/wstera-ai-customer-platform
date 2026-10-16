import assert from "node:assert/strict";
import test from "node:test";
import type { ModelTokenUsage } from "../../../contracts/models/index.js";
import type { SupportEvidence } from "../../../modules/ai-engine/support-orchestrator.js";
import { ModelAdapterError, OpenAICompatibleChatAdapter } from "./chat-completions.js";

const evidence: readonly SupportEvidence[] = Object.freeze([Object.freeze({
  referenceId: "evidence-1",
  sourceLabel: "Shipping FAQ",
  text: "ส่งสินค้าภายใน 2 วันทำการ",
})]);

function completion(content: string, options: { usage?: unknown; status?: number } = {}) {
  return new Response(JSON.stringify({
    choices: [{ message: { role: "assistant", content } }],
    usage: Object.prototype.hasOwnProperty.call(options, "usage")
      ? options.usage
      : { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
  }), { status: options.status ?? 200, headers: { "content-type": "application/json" } });
}

function harness(fetcher: typeof fetch, options: {
  apiKey?: string;
  baseUrl?: string;
  usageFails?: boolean;
  usageHangs?: boolean;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
} = {}) {
  const usage: ModelTokenUsage[] = [];
  const adapter = new OpenAICompatibleChatAdapter({
    providerId: "test-provider",
    baseUrl: options.baseUrl ?? "https://models.example.test/v1",
    apiKey: options.apiKey ?? "test-only-key",
    model: "test-model",
    fetch: fetcher,
    timeoutMs: options.timeoutMs,
    maxRequestBytes: options.maxRequestBytes,
    maxResponseBytes: options.maxResponseBytes,
    usage: {
      async record(value, signal) {
        if (options.usageFails) throw new Error("raw persistence failure with secret test-only-key");
        if (options.usageHangs) return await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        });
        usage.push(value);
      },
    },
  });
  return { adapter, usage };
}

test("answerability sends bounded JSON-mode request and records per-workspace token usage", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const { adapter, usage } = harness(async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return completion('{"kind":"answerable"}');
  });
  const result = await adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence });
  assert.deepEqual(result, { kind: "answerable" });
  assert.equal(requestUrl, "https://models.example.test/v1/chat/completions");
  assert.equal(requestInit?.method, "POST");
  assert.equal(requestInit?.redirect, "error");
  assert.equal(new Headers(requestInit?.headers).get("authorization"), "Bearer test-only-key");
  const payload = JSON.parse(String(requestInit?.body));
  assert.equal(payload.model, "test-model");
  assert.equal(payload.max_completion_tokens, 512);
  assert.deepEqual(payload.response_format, { type: "json_object" });
  assert.equal(payload.store, false);
  assert.equal(payload.messages[1].content.includes("shop-1"), false);
  assert.match(payload.messages[0].content, /untrusted data/);
  assert.match(payload.messages[1].content, /ส่งสินค้าภายใน 2 วันทำการ/);
  assert.deepEqual(usage, [{
    workspaceId: "shop-1", providerId: "test-provider", model: "test-model", operation: "answerability",
    inputTokens: 20, outputTokens: 8, totalTokens: 28,
  }]);
});

test("grounded answer returns only bounded text and evidence references", async () => {
  const { adapter, usage } = harness(async () => completion('{"text":"ส่งภายใน 2 วันทำการ","citationRefs":["evidence-1"]}'));
  const result = await adapter.generate({ workspaceId: "shop-2", query: "ส่งของกี่วัน", evidence });
  assert.deepEqual(result, { text: "ส่งภายใน 2 วันทำการ", citationRefs: ["evidence-1"] });
  assert.equal(usage[0]?.workspaceId, "shop-2");
  assert.equal(usage[0]?.operation, "grounded_answer");
});

test("configuration rejects missing credentials, unsafe URLs and invalid HTTP endpoints", () => {
  const fetcher: typeof fetch = async () => completion('{"kind":"uncertain"}');
  assert.throws(() => harness(fetcher, { apiKey: "   " }), { code: "INVALID_CONFIGURATION" });
  assert.throws(() => harness(fetcher, { baseUrl: "http://models.example.test/v1" }), { code: "INVALID_CONFIGURATION" });
  assert.throws(() => harness(fetcher, { baseUrl: "https://user:pass@models.example.test/v1" }), { code: "INVALID_CONFIGURATION" });
  assert.throws(() => harness(fetcher, { baseUrl: "https://models.example.test/v1?tenant=shop" }), { code: "INVALID_CONFIGURATION" });
  assert.doesNotThrow(() => new OpenAICompatibleChatAdapter({
    providerId: "local",
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "local-only-test-key",
    model: "local-model",
    allowLocalHttp: true,
    fetch: fetcher,
    usage: { async record() {} },
  }));
});

test("invalid input and oversized request do not call the transport", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return completion('{"kind":"answerable"}'); };
  const { adapter } = harness(fetcher, { maxRequestBytes: 100 });
  await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "REQUEST_TOO_LARGE" });
  await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: " ", evidence }), { code: "INVALID_INPUT" });
  const accessorInput = Object.defineProperty({ workspaceId: "shop-1", evidence }, "query", { get: () => "ส่งของกี่วัน" });
  await assert.rejects(adapter.assess(accessorInput as never), { code: "INVALID_INPUT" });
  assert.equal(calls, 0);
});

test("configuration is snapshotted and inherited usage recorder methods remain supported", async () => {
  let recorded = 0;
  class Recorder {
    async record(_usage: ModelTokenUsage) { recorded++; }
  }
  let observedModel = "";
  const config = {
    providerId: "test-provider",
    baseUrl: "https://models.example.test/v1",
    apiKey: "test-only-key",
    model: "original-model",
    usage: new Recorder(),
    fetch: (async (_input, init) => {
      observedModel = JSON.parse(String(init?.body)).model;
      return completion('{"kind":"answerable"}');
    }) as typeof fetch,
  };
  const adapter = new OpenAICompatibleChatAdapter(config);
  config.model = "mutated-model";
  config.apiKey = "mutated-key";
  config.baseUrl = "https://attacker.example.test/v1";
  await adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence });
  assert.equal(observedModel, "original-model");
  assert.equal(recorded, 1);
});

test("provider errors are normalized and never include response bodies or credentials", async () => {
  const { adapter } = harness(async () => new Response("secret=test-only-key database=private", { status: 503 }));
  await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), (error: unknown) => {
    assert.ok(error instanceof ModelAdapterError);
    assert.equal(error.code, "HTTP_ERROR");
    assert.equal(error.status, 503);
    assert.equal(error.message.includes("test-only-key"), false);
    assert.equal(error.message.includes("private"), false);
    return true;
  });
});

test("timeouts abort the request and return a normalized error", async () => {
  const { adapter } = harness((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  }), { timeoutMs: 5 });
  await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "TIMEOUT" });
});

test("timeout settles even when the host transport ignores AbortSignal", async () => {
  let observedSignal: AbortSignal | null | undefined;
  const { adapter } = harness((_input, init) => {
    observedSignal = init?.signal;
    return new Promise<Response>(() => undefined);
  }, { timeoutMs: 5 });
  await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "TIMEOUT" });
  assert.equal(observedSignal?.aborted, true);
});

test("timeout cancels and settles a stalled response body", async () => {
  const { adapter } = harness(async () => new Response(new ReadableStream<Uint8Array>({ start() {} })), { timeoutMs: 5 });
  await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "TIMEOUT" });
});

test("oversized, malformed, and usage-free responses fail closed", async (t) => {
  await t.test("oversized body", async () => {
    const { adapter } = harness(async () => new Response("x".repeat(300), { status: 200 }), { maxResponseBytes: 100 });
    await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "RESPONSE_TOO_LARGE" });
  });
  await t.test("invalid JSON", async () => {
    const { adapter } = harness(async () => new Response("not json", { status: 200 }));
    await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "INVALID_PROVIDER_RESPONSE" });
  });
  await t.test("missing token usage", async () => {
    const { adapter } = harness(async () => completion('{"kind":"answerable"}', { usage: null }));
    await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "INVALID_PROVIDER_RESPONSE" });
  });
  await t.test("usage persistence failure", async () => {
    const { adapter } = harness(async () => completion('{"kind":"answerable"}'), { usageFails: true });
    await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), (error: unknown) => {
      assert.ok(error instanceof ModelAdapterError);
      assert.equal(error.code, "USAGE_RECORDING_FAILED");
      assert.equal(error.message.includes("test-only-key"), false);
      return true;
    });
  });
  await t.test("usage persistence is included in the operation timeout", async () => {
    const { adapter } = harness(async () => completion('{"kind":"answerable"}'), { usageHangs: true, timeoutMs: 5 });
    await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "TIMEOUT" });
  });
});

test("malformed assessment and fabricated citation references never reach callers", async (t) => {
  await t.test("assessment schema", async () => {
    const { adapter } = harness(async () => completion('{"kind":"answerable","extra":true}'));
    await assert.rejects(adapter.assess({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "INVALID_PROVIDER_RESPONSE" });
  });
  await t.test("fabricated citation", async () => {
    const { adapter } = harness(async () => completion('{"text":"คำตอบ","citationRefs":["other"]}'));
    await assert.rejects(adapter.generate({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "INVALID_PROVIDER_RESPONSE" });
  });
  await t.test("empty answer", async () => {
    const { adapter } = harness(async () => completion('{"text":"","citationRefs":[]}'));
    await assert.rejects(adapter.generate({ workspaceId: "shop-1", query: "ส่งของกี่วัน", evidence }), { code: "INVALID_PROVIDER_RESPONSE" });
  });
});
