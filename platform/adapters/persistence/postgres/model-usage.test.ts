import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { NO_ACTOR_FOR_SCHEMA_TESTS, PostgresKnowledgeRepository, type PostgresDatabasePort, type PostgresQueryPort, type PostgresRow } from "./knowledge-repository.js";
import { PostgresModelSpendLedger } from "./model-usage.js";
import { createFaqVersion, type KnowledgeVersionDraft } from "../../../modules/knowledge/index.js";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";
import { OWNER_A, OWNER_B, authenticatedRpcClient, createMigratedDatabase, runtimePort } from "../../../composition/testing/merchant-host-harness.js";
import { SupabaseKnowledgeApproval } from "../supabase/knowledge-approval.js";
import { PostgresConversationRepository } from "./conversation-repository.js";

type Db = Awaited<ReturnType<typeof createMigratedDatabase>>;
const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
const shopB = createTrustedWorkspace({ workspaceId: "shop-b", connectionId: "web-b", channel: "web" });
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

async function addFaq(database: Db, repository: PostgresKnowledgeRepository, sourceId: string, text: string, visibility: "customer" | "internal", workspace = shopA) {
  const version = createFaqVersion({ workspace, sourceId, versionId: "v1", title: sourceId, content: text, visibility });
  await repository.createSource(workspace, { sourceId, title: sourceId, kind: "faq" });
  await repository.createVersion(workspace, version as KnowledgeVersionDraft);
  for (const to of ["validating", "extracting", "indexed"] as const) await repository.transitionVersion(workspace, sourceId, "v1", to);
  await new SupabaseKnowledgeApproval(authenticatedRpcClient(database, workspace.workspaceId === "shop-b" ? OWNER_B : OWNER_A)).approve(workspace, sourceId, "v1");
}

test("real host: flag off never calls the provider; flag on answers with citations, records usage, respects caps and hides internal knowledge", async () => {
  register("data:text/javascript,export async function resolve(specifier, context, nextResolve) { if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }; return nextResolve(specifier); }", import.meta.url);
  const database = await createMigratedDatabase();
  try {
    const repository = new PostgresKnowledgeRepository(runtimePort(database), NO_ACTOR_FOR_SCHEMA_TESTS);
    await addFaq(database, repository, "shipping", "จัดส่งใช้เวลา 2 วันทำการ", "customer");
    await addFaq(database, repository, "services", "มีบริการติดตั้งฟรีในเขตกรุงเทพมหานคร และบริการห่อของขวัญ", "customer");
    await addFaq(database, repository, "price-a", "สินค้า Alpha ราคา 900 บาท", "customer");
    await addFaq(database, repository, "price-b", "สินค้า Beta ราคา 1,200 บาท", "customer");
    await addFaq(database, repository, "warranty", "สินค้ารับ warranty 2 ปีเต็มนับจากวันที่ซื้อ", "customer");
    await addFaq(database, repository, "internal", "จัดส่งแบบ VIP ใช้เวลา 30 นาที ต้นทุนลับ 999", "internal");
    await addFaq(database, repository, "other-shop", "รหัสเฉพาะร้านอีกแห่งคือ FOREIGN-ONLY-7319", "customer", shopB);
    const countedStatements: string[] = [];
    const port: PostgresDatabasePort & { assertLeastPrivilege(): Promise<void> } = { ...runtimePort(database, countedStatements), async assertLeastPrivilege() {} };
    const { createWebChatRealHost } = await import("../../../composition/web-chat-real-host.js");
    const requests: string[] = [];
    const logs: string[] = [];
    let reply = '{"text":"จัดส่งใช้เวลา 2 วันทำการ ครับ","citationRefs":["evidence-1"]}';
    let triage = "answerable";
    let gateFailure: "none" | "provider" | "malformed" = "none";
    const fetcher = (async (_url: unknown, init: RequestInit) => {
      const body = String(init.body);
      requests.push(body);
      const isTriage = body.includes("Classify the customer query");
      if (isTriage && gateFailure === "provider") throw new Error("synthetic provider failure");
      const request = JSON.parse(body) as { messages: Array<{ content: string }> };
      const userPayload = JSON.parse(request.messages[1]!.content) as { query: string; evidence: Array<{ referenceId: string; text: string }> };
      const result = isTriage && gateFailure === "malformed" ? "not-json"
        : isTriage
        ? JSON.stringify({ kind: userPayload.query.includes("นายชื่อไร") ? "small_talk" : userPayload.query.includes("สาขา") ? "insufficient_evidence" : triage })
        : userPayload.query.includes("ราคาสองสินค้า")
          ? JSON.stringify({ text: "Alpha 900 บาท; Beta 1,200 บาท", citationRefs: userPayload.evidence.filter((item) => /Alpha|Beta/u.test(item.text)).map((item) => item.referenceId) })
          : reply;
      return new Response(JSON.stringify({ choices: [{ message: { content: result } }], usage: { prompt_tokens: 70, completion_tokens: 12, total_tokens: 82 } }), { status: 200 });
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
    countedStatements.length = 0;
    const answer = await ask(host, "conv-on");
    const openFlagCommands = countedStatements.length;
    const openFlagTransactions = countedStatements.filter((sql) => sql === "BEGIN").length;
    // 50 -> 66: lane A reads the last 4 turns and the shop profile + catalog (three small transactions) per message when the model path is on.
    assert.ok(openFlagCommands <= 66, `flag-on DB command ceiling: ${openFlagCommands}`);
    console.log("CHAT_DB_COMMANDS_FLAG_ON", openFlagCommands, openFlagTransactions);
    assert.equal(answer.kind, "answer");
    assert.equal(answer.text, "จัดส่งใช้เวลา 2 วันทำการ ครับ");
    assert.deepEqual(answer.citations?.map((c) => c.sourceId), ["shipping"]);
    assert.equal(requests.length, 2);
    assert.equal(requests.some((body) => body.includes("ต้นทุนลับ")), false, "internal knowledge never reaches the provider");
    assert.equal(requests.some((body) => body.includes(KEY)), false);
    const ledgerRows = (await database.query<Record<string, unknown>>("SELECT * FROM aicp.model_usage")).rows;
    assert.equal(ledgerRows.length, 2);
    assert.ok(ledgerRows.every((row) => row.workspace_id === "shop-a" && row.conversation_id === "conv-on" && row.model === "test-model" && row.status === "settled" && row.input_tokens === 70 && row.output_tokens === 12));
    assert.equal(JSON.stringify(ledgerRows).includes("จัดส่ง"), false, "no message text in the ledger");

    // The invalid citation reaches generation in a fresh window, then falls back without retry.
    await database.exec("UPDATE aicp.model_usage SET usage_day = usage_day - 1");
    reply = '{"text":"ฟรีทุกออเดอร์","citationRefs":["evidence-9"]}';
    const beforeInvalidCitation = requests.length;
    const bad = await ask(host, "conv-on");
    assert.equal(bad.text, "จัดส่งใช้เวลา 2 วันทำการ");
    assert.equal(requests.length, beforeInvalidCitation + 2, "triage and generation both run before the forged citation is rejected");
    // Ceiling reached at the gate: no model call and extractive still answers.
    const beforeCapped = requests.length;
    const capped = await ask(host, "conv-on");
    assert.equal(capped.text, "จัดส่งใช้เวลา 2 วันทำการ");
    assert.equal(requests.length, beforeCapped);
    assert.ok(logs.some((line) => line.includes("DAILY_CALL_LIMIT")));
    assert.equal(logs.join("").includes(KEY), false);

    // A foreign shop's approved source is absent from both model payloads and the returned answer.
    await database.exec("UPDATE aicp.model_usage SET usage_day = usage_day - 1");
    reply = '{"text":"จัดส่งใช้เวลา 2 วันทำการ ครับ","citationRefs":["evidence-1"]}';
    const beforeIsolation = requests.length;
    const isolated = await ask(host, "conv-isolation", "จัดส่งใช้เวลากี่วัน และรหัสเฉพาะร้านอีกแห่งคืออะไร");
    assert.equal(isolated.text, "จัดส่งใช้เวลา 2 วันทำการ ครับ");
    assert.equal(requests.length, beforeIsolation + 2);
    assert.equal(requests.slice(beforeIsolation).join("").includes("FOREIGN-ONLY-7319"), false);
    assert.equal(isolated.text?.includes("FOREIGN-ONLY-7319"), false);

    // Every model-gate failure is terminal for model use; the legacy path remains extractive.
    for (const failure of ["provider", "malformed"] as const) {
      await database.exec("UPDATE aicp.model_usage SET usage_day = usage_day - 1");
      gateFailure = failure;
      const beforeFailure: number = requests.length;
      const fallback = await ask(host, `conv-gate-${failure}`);
      assert.equal(fallback.text, "จัดส่งใช้เวลา 2 วันทำการ");
      // A provider fault is retried once inside the gate (lane A); a malformed reply is not. Neither reaches the answer model.
      assert.equal(requests.length, beforeFailure + (failure === "provider" ? 2 : 1), `${failure} gate failure must not trigger an answer model call`);
    }
    gateFailure = "none";

    // A ledger outage fails closed before the provider and rejoins the extractive path.
    const outagePort: PostgresDatabasePort & { assertLeastPrivilege(): Promise<void> } = {
      ...port,
      async query<Row extends PostgresRow = PostgresRow>(sql: string, values: readonly unknown[] = []) { return port.query<Row>(sql, values); },
      async transaction<T>(operation: (query: PostgresQueryPort) => Promise<T>) {
        return port.transaction((query) => operation({ async query<Row extends PostgresRow>(sql: string, values?: readonly unknown[]) {
          if (sql.includes("aicp.model_usage")) throw new Error("synthetic ledger outage");
          return query.query<Row>(sql, values);
        } }));
      },
    };
    const outageHost = await createWebChatRealHost(outagePort, { env, fetch: fetcher, log });
    const beforeOutage = requests.length;
    const outage = await ask(outageHost, "conv-gate-ledger");
    assert.equal(outage.text, "จัดส่งใช้เวลา 2 วันทำการ");
    assert.equal(requests.length, beforeOutage, "ledger outage must not call the provider");
    assert.equal((await database.query("SELECT 1 FROM aicp.model_usage WHERE conversation_id='conv-gate-ledger'")).rows.length, 0);

    // A human-owned conversation bypasses both gate and generation and creates no model usage row.
    const conversations = new PostgresConversationRepository(runtimePort(database));
    await conversations.create(shopA, "conv-human-active");
    await conversations.append(shopA, "conv-human-active", 0, { kind: "handoff_requested", reason: "customer_requested", occurredAt: new Date().toISOString() });
    await conversations.append(shopA, "conv-human-active", 1, { kind: "operator_claimed", staffId: "staff-a", occurredAt: new Date().toISOString() });
    const beforeHuman = requests.length;
    const human = await ask(host, "conv-human-active");
    assert.equal(human.kind, "ai_paused");
    assert.equal(requests.length, beforeHuman);
    assert.equal((await database.query("SELECT 1 FROM aicp.model_usage WHERE conversation_id='conv-human-active'")).rows.length, 0);

    // the model declining for lack of evidence becomes a handoff, not an answer
    await database.exec("UPDATE aicp.model_usage SET usage_day = usage_day - 1");
    triage = "insufficient_evidence";
    reply = '{"text":"","citationRefs":[]}';
    const declined = await ask(host, "conv-decline");
    assert.equal(declined.kind, "handoff_requested");

    // Each additional case gets a fresh local daily window; the fake fetch never contacts a provider.
    await database.exec("UPDATE aicp.model_usage SET usage_day = usage_day - 1");
    const beforeName = requests.length;
    const name = await ask(host, "conv-name", "นายชื่อไร");
    assert.equal(name.kind, "small_talk");
    assert.match(name.text ?? "", /ผู้ช่วยของร้าน/u);
    assert.equal(requests.length, beforeName + 1, "small-talk triage does not generate customer text");

    triage = "answerable";
    reply = '{"text":"สรุปข้อมูลจากเอกสารร้าน","citationRefs":["evidence-1"]}';
    for (const [id, query] of [["conv-services", "มีบริการอะไรบ้างครับ"], ["conv-offers", "มีอะไรเสนอไหม"], ["conv-warranty", "สินค้ารับ warranty กี่ปี"]] as const) {
      await database.exec("UPDATE aicp.model_usage SET usage_day = usage_day - 1");
      const answer = await ask(host, id, query);
      assert.equal(answer.kind, "answer", query);
      assert.ok((answer.citations?.length ?? 0) > 0, `${query} is source cited`);
    }
    await database.exec("UPDATE aicp.model_usage SET usage_day = usage_day - 1");
    reply = '{"text":"Alpha 900 บาท; Beta 1,200 บาท","citationRefs":[]}';
    const prices = await ask(host, "conv-prices", "ราคาสองสินค้า Alpha กับ Beta เท่าไหร่");
    assert.equal(prices.kind, "answer");
    assert.deepEqual(new Set(prices.citations?.map((citation) => citation.sourceId)), new Set(["price-a", "price-b"]));
    await database.exec("UPDATE aicp.model_usage SET usage_day = usage_day - 1");
    const unknown = await ask(host, "conv-unknown", "มีสาขาไหม");
    assert.equal(unknown.kind, "handoff_requested");
    assert.equal((await database.query("SELECT 1 FROM aicp.model_usage WHERE conversation_id='conv-unknown'")).rows.length, 1);
  } finally { await database.close(); }
});
