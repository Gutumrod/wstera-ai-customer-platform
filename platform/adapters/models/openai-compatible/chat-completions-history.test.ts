import assert from "node:assert/strict";
import test from "node:test";
import { OpenAICompatibleChatAdapter } from "./chat-completions.js";

const evidence = [{ referenceId: "e1", sourceLabel: "FAQ", text: "จัดส่งสองวัน" }];
function response(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200 });
}
function adapter(fetcher: typeof fetch) {
  return new OpenAICompatibleChatAdapter({ providerId: "test", baseUrl: "https://example.test/v1", apiKey: "test" + "-credential", model: "test-model", fetch: fetcher, usage: { async record() {} } });
}

test("all model operations include bounded history and preserve history-free payload shape", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const instance = adapter(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    bodies.push(body as unknown as Record<string, unknown>);
    const operation = bodies.length;
    return response(operation === 1 ? '{"kind":"partially_answerable"}' : operation === 2 ? '{"kind":"partially_answerable"}' : '{"text":"จัดส่งสองวันครับ","citationRefs":["e1"]}');
  });
  const longHistory = Array.from({ length: 6 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "customer" as const, text: `${index}${"x".repeat(600)}` }));
  await instance.assess({ workspaceId: "shop-a", query: "และประกันไหม", evidence, history: longHistory });
  await instance.triage({ workspaceId: "shop-a", query: "และประกันไหม", evidence, history: longHistory });
  await instance.generate({ workspaceId: "shop-a", query: "และประกันไหม", evidence, history: longHistory });
  const historyPayload = JSON.parse((bodies[0]!.messages as Array<{ content: string }>)[1]!.content) as { history: Array<{ role: string; text: string }> };
  assert.equal(historyPayload.history.length, 4);
  assert.ok(historyPayload.history.every((turn) => turn.text.length === 500));
  assert.deepEqual(historyPayload.history.map((turn) => turn.role), ["customer", "assistant", "customer", "assistant"]);

  const noHistoryBody: string[] = [];
  const noHistory = adapter(async (_url, init) => { noHistoryBody.push(String(init?.body)); return response('{"kind":"answerable"}'); });
  await noHistory.assess({ workspaceId: "shop-a", query: "ส่งกี่วัน", evidence });
  const noHistoryPayload = JSON.parse(noHistoryBody[0]!) as { messages: Array<{ content: string }> };
  assert.equal(noHistoryPayload.messages[1]!.content, JSON.stringify({ query: "ส่งกี่วัน", evidence }));
});
