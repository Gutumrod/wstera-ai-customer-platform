import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { NO_ACTOR_FOR_SCHEMA_TESTS, PostgresKnowledgeRepository, type PostgresDatabasePort } from "./knowledge-repository.js";
import { PostgresModelSpendLedger } from "./model-usage.js";
import { createFaqVersion, type KnowledgeVersionDraft } from "../../../modules/knowledge/index.js";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";
import { OWNER_A, authenticatedRpcClient, createMigratedDatabase, runtimePort } from "../../../composition/testing/merchant-host-harness.js";
import { SupabaseKnowledgeApproval } from "../supabase/knowledge-approval.js";

type Db = Awaited<ReturnType<typeof createMigratedDatabase>>;
const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
const KEY = "synthetic-key-for-tests-only";
const limits = { maxDailyCostMicros: 1_000, maxDailyCalls: 3 };
const reservation = (workspaceId: string, cost = 10, overrides: Partial<typeof limits> = {}) => ({
  workspaceId, conversationId: "conv-1", providerId: "p", model: "m", operation: "grounded_answer" as const,
  reserveCostMicros: cost, limits: { ...limits, ...overrides },
});

test("model_usage migration: columns, RLS, grants", async () => {
  const database = await createMigratedDatabase();
  try {
    const columns = (await database.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema='aicp' AND table_name='model_usage'")).rows.map((row) => row.column_name);
    assert.deepEqual(columns.filter((name) => /body|text|content|message|prompt|answer/u.test(name)), []);
    const flags = (await database.query<{ rls: boolean; forced: boolean }>("SELECT relrowsecurity AS rls, relforcerowsecurity AS forced FROM pg_class WHERE oid='aicp.model_usage'::regclass")).rows[0];
    assert.deepEqual(flags, { rls: true, forced: true });
    const runtime = runtimePort(database);
    const ledger = new PostgresModelSpendLedger(runtime);
    const one = await ledger.reserve(reservation("shop-a"));
    assert.equal(one.kind, "reserved");
    // runtime role cannot delete rows or rewrite identity columns, and RLS hides other workspaces
    await assert.rejects(runtime.transaction((q) => q.query("DELETE FROM aicp.model_usage")));
    await assert.rejects(runtime.transaction((q) => q.query("UPDATE aicp.model_usage SET model='x'")));
    await assert.rejects(runtime.transaction((q) => q.query("UPDATE aicp.model_usage SET workspace_id='shop-b'")));
    const seen = await runtime.transaction(async (q) => {
      await q.query("SELECT set_config('app.workspace_id','shop-b',true)");
      return (await q.query("SELECT id FROM aicp.model_usage")).rows.length;
    });
    assert.equal(seen, 0);
    await assert.rejects(runtime.transaction(async (q) => {
      await q.query("SELECT set_config('app.workspace_id','shop-b',true)");
      await q.query("INSERT INTO aicp.model_usage (workspace_id, provider_id, model, operation) VALUES ('shop-a','p','m','grounded_answer')");
    }));
    // token columns are all-null or consistent
    await assert.rejects(database.exec("INSERT INTO aicp.model_usage (workspace_id, provider_id, model, operation, input_tokens) VALUES ('shop-a','p','m','grounded_answer',5)"));
    await assert.rejects(database.exec("INSERT INTO aicp.model_usage (workspace_id, provider_id, model, operation, input_tokens, output_tokens, total_tokens) VALUES ('shop-a','p','m','grounded_answer',5,5,11)"));
  } finally { await database.close(); }
});

test("ledger enforces call and cost ceilings per workspace, atomically", async () => {
  const database = await createMigratedDatabase();
  try {
    const ledger = new PostgresModelSpendLedger(runtimePort(database));
    // 8 concurrent reservations against a ceiling of 3: exactly 3 win, even at cost 0
    const racers = await Promise.all(Array.from({ length: 8 }, () => ledger.reserve(reservation("shop-a", 0))));
    assert.equal(racers.filter((r) => r.kind === "reserved").length, 3);
    assert.deepEqual(racers.find((r) => r.kind === "limit"), { kind: "limit", reason: "DAILY_CALL_LIMIT" });
    // another workspace is unaffected
    assert.equal((await ledger.reserve(reservation("shop-b", 0))).kind, "reserved");
    // cost ceiling
    assert.deepEqual(await ledger.reserve(reservation("shop-b", 2_000)), { kind: "limit", reason: "DAILY_COST_LIMIT" });
    const first = await ledger.reserve(reservation("shop-b", 900));
    assert.equal(first.kind, "reserved");
    assert.deepEqual(await ledger.reserve(reservation("shop-b", 101)), { kind: "limit", reason: "DAILY_COST_LIMIT" });
    // settling with real tokens frees the unused part of the reservation
    assert.ok(first.kind === "reserved");
    await ledger.settle({ workspaceId: "shop-b", callId: first.callId, costMicros: 50, usage: { workspaceId: "shop-b", providerId: "p", model: "m", operation: "grounded_answer", inputTokens: 40, outputTokens: 10, totalTokens: 50 } });
    assert.equal((await ledger.reserve(reservation("shop-b", 101))).kind, "reserved");
    const row = (await database.query<{ status: string; input_tokens: number; estimated_cost_micros: string }>("SELECT status, input_tokens, estimated_cost_micros::text FROM aicp.model_usage WHERE id=$1", [first.callId])).rows[0];
    assert.deepEqual(row, { status: "settled", input_tokens: 40, estimated_cost_micros: "50" });
    // yesterday's rows do not count today
    await database.exec("UPDATE aicp.model_usage SET usage_day = usage_day - 1");
    assert.equal((await ledger.reserve(reservation("shop-a", 0))).kind, "reserved");
  } finally { await database.close(); }
});

async function addFaq(database: Db, repository: PostgresKnowledgeRepository, sourceId: string, text: string, visibility: "customer" | "internal") {
  const version = createFaqVersion({ workspace: shopA, sourceId, versionId: "v1", title: sourceId, content: text, visibility });
  await repository.createSource(shopA, { sourceId, title: sourceId, kind: "faq" });
  await repository.createVersion(shopA, version as KnowledgeVersionDraft);
  for (const to of ["validating", "extracting", "indexed"] as const) await repository.transitionVersion(shopA, sourceId, "v1", to);
  await new SupabaseKnowledgeApproval(authenticatedRpcClient(database, OWNER_A)).approve(shopA, sourceId, "v1");
}

test("real host: flag off never calls the provider; flag on answers with citations, records usage, respects caps and hides internal knowledge", async () => {
  register("data:text/javascript,export async function resolve(specifier, context, nextResolve) { if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }; return nextResolve(specifier); }", import.meta.url);
  const database = await createMigratedDatabase();
  try {
    const repository = new PostgresKnowledgeRepository(runtimePort(database), NO_ACTOR_FOR_SCHEMA_TESTS);
    await addFaq(database, repository, "shipping", "จัดส่งใช้เวลา 2 วันทำการ", "customer");
    await addFaq(database, repository, "internal", "จัดส่งแบบ VIP ใช้เวลา 30 นาที ต้นทุนลับ 999", "internal");
    const port: PostgresDatabasePort & { assertLeastPrivilege(): Promise<void> } = { ...runtimePort(database), async assertLeastPrivilege() {} };
    const { createWebChatRealHost } = await import("../../../composition/web-chat-real-host.js");
    const requests: string[] = [];
    const logs: string[] = [];
    let reply = '{"text":"จัดส่งใช้เวลา 2 วันทำการ ครับ","citationRefs":["evidence-1"]}';
    const fetcher = (async (_url: unknown, init: RequestInit) => {
      requests.push(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: reply } }], usage: { prompt_tokens: 70, completion_tokens: 12, total_tokens: 82 } }), { status: 200 });
    }) as typeof fetch;
    const log = (event: string, fields: Readonly<Record<string, string | number>>) => logs.push(JSON.stringify({ event, ...fields }));
    const env = {
      AICP_MODEL_ANSWERS_ENABLED: "true", AICP_MODEL_PROVIDER_ID: "test-provider", AICP_MODEL_BASE_URL: "https://models.example.test/v1",
      AICP_MODEL_NAME: "test-model", AICP_MODEL_API_KEY: KEY, AICP_MODEL_PRICE_INPUT_PER_MTOK: "0", AICP_MODEL_PRICE_OUTPUT_PER_MTOK: "0",
      AICP_MODEL_DAILY_MAX_CALLS: "2",
    };
    const ask = (host: Awaited<ReturnType<typeof createWebChatRealHost>>, conversationId: string, query = "จัดส่งใช้เวลากี่วัน") =>
      host.responder({ workspace: shopA, conversationId, query, audience: "customer" } as never) as Promise<{ kind: string; text?: string; citations?: Array<{ sourceId: string }> }>;

    // flag off, and flag on with an incomplete setting: extractive, provider untouched
    for (const off of [{}, { ...env, AICP_MODEL_ANSWERS_ENABLED: "false" }, { ...env, AICP_MODEL_API_KEY: "" }]) {
      const host = await createWebChatRealHost(port, { env: off, fetch: fetcher, log });
      const answer = await ask(host, "conv-off");
      assert.equal(answer.kind, "answer");
      assert.match(answer.text ?? "", /^จัดส่งใช้เวลา 2 วันทำการ$/u);
    }
    assert.equal(requests.length, 0);
    assert.equal((await database.query("SELECT 1 FROM aicp.model_usage")).rows.length, 0);

    const host = await createWebChatRealHost(port, { env, fetch: fetcher, log });
    const answer = await ask(host, "conv-on");
    assert.equal(answer.kind, "answer");
    assert.equal(answer.text, "จัดส่งใช้เวลา 2 วันทำการ ครับ");
    assert.deepEqual(answer.citations?.map((c) => c.sourceId), ["shipping"]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.includes("ต้นทุนลับ"), false, "internal knowledge never reaches the provider");
    assert.equal(requests[0]!.includes(KEY), false);
    const ledgerRows = (await database.query<Record<string, unknown>>("SELECT * FROM aicp.model_usage")).rows;
    assert.equal(ledgerRows.length, 1);
    assert.deepEqual([ledgerRows[0]?.workspace_id, ledgerRows[0]?.conversation_id, ledgerRows[0]?.model, ledgerRows[0]?.status, ledgerRows[0]?.input_tokens, ledgerRows[0]?.output_tokens], ["shop-a", "conv-on", "test-model", "settled", 70, 12]);
    assert.equal(JSON.stringify(ledgerRows).includes("จัดส่ง"), false, "no message text in the ledger");

    // a reply that cites nothing real falls back to the extractive answer (still cited), second call uses the last allowed slot
    reply = '{"text":"ฟรีทุกออเดอร์","citationRefs":["evidence-9"]}';
    const bad = await ask(host, "conv-on");
    assert.equal(bad.text, "จัดส่งใช้เวลา 2 วันทำการ");
    // ceiling reached: provider not called again, extractive still answers
    const capped = await ask(host, "conv-on");
    assert.equal(capped.text, "จัดส่งใช้เวลา 2 วันทำการ");
    assert.equal(requests.length, 2);
    assert.ok(logs.some((line) => line.includes("DAILY_CALL_LIMIT")));
    assert.equal(logs.join("").includes(KEY), false);

    // the model declining for lack of evidence becomes a handoff, not an answer
    await database.exec("UPDATE aicp.model_usage SET usage_day = usage_day - 1");
    reply = '{"text":"","citationRefs":[]}';
    const declined = await ask(host, "conv-decline");
    assert.equal(declined.kind, "handoff_requested");
  } finally { await database.close(); }
});
