import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { NO_ACTOR_FOR_SCHEMA_TESTS, PostgresKnowledgeRepository, type PostgresDatabasePort } from "./knowledge-repository.js";
import { PostgresWebChatConfiguration } from "./web-chat-configuration.js";
import { createFaqVersion, type KnowledgeCitation, type KnowledgeVersionDraft } from "../../../modules/knowledge/index.js";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";
import { createMigratedDatabase, runtimePort } from "../../../composition/testing/merchant-host-harness.js";
import { OWNER_A, STAFF_A, authenticatedRpcClient } from "../../../composition/testing/merchant-host-harness.js";
import { SupabaseKnowledgeApproval } from "../supabase/knowledge-approval.js";
import { createWebChatRoutes } from "../../../composition/web-chat-routes.js";
import { HandoffService } from "../../../composition/handoff-service.js";
import { inspectSessionCookie } from "../../../composition/web-chat-session.js";

const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
const shopB = createTrustedWorkspace({ workspaceId: "shop-b", connectionId: "web-b", channel: "web" });
const secret = "local-synthetic-web-chat-secret-32-bytes-minimum";

function client(database: Awaited<ReturnType<typeof createMigratedDatabase>>, statements?: string[]): PostgresDatabasePort & { assertLeastPrivilege(): Promise<void> } {
  return { ...runtimePort(database, statements), async assertLeastPrivilege() {} };
}

async function addApprovedFaq(repository: PostgresKnowledgeRepository, database: Awaited<ReturnType<typeof createMigratedDatabase>>, workspace: typeof shopA, sourceId: string, text: string, visibility: "customer" | "internal") {
  const version = createFaqVersion({ workspace, sourceId, versionId: "v1", title: sourceId, content: text, visibility });
  await repository.createSource(workspace, { sourceId, title: sourceId, kind: "faq" });
  await repository.createVersion(workspace, version as KnowledgeVersionDraft);
  await repository.transitionVersion(workspace, sourceId, "v1", "validating");
  await repository.transitionVersion(workspace, sourceId, "v1", "extracting");
  await repository.transitionVersion(workspace, sourceId, "v1", "indexed");
  await new SupabaseKnowledgeApproval(authenticatedRpcClient(database, OWNER_A)).approve(workspace, sourceId, "v1");
}

function cookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  return setCookie.split(";", 1)[0]!;
}

function chatRequest(text: string, session: string, origin = "https://shop-a.example"): Request {
  return new Request("http://localhost/chat/message", {
    method: "POST",
    headers: { cookie: session, origin, "content-type": "application/json" },
    body: JSON.stringify({ connectionId: "web-a", text }),
  });
}

test("web chat host resolves active web connection and limits configuration reads to workspace scope", async () => {
  const database = await createMigratedDatabase();
  try {
    await database.exec(`
      CREATE ROLE anon NOLOGIN;
      UPDATE aicp.workspace_connections SET allowed_origins = ARRAY['https://shop-a.example'] WHERE connection_id = 'web-a';
      UPDATE aicp.workspace_connections SET allowed_origins = ARRAY['https://shop-b.example'] WHERE connection_id = 'web-b';
      UPDATE aicp.workspaces SET query_aliases = '[["ส่งของ","จัดส่ง"]]'::jsonb WHERE workspace_id = 'shop-a';
      UPDATE aicp.workspaces SET query_aliases = '[]'::jsonb WHERE workspace_id = 'shop-b';
      UPDATE aicp.workspace_connections SET status = 'disabled' WHERE connection_id = 'disabled-web';
      INSERT INTO aicp.workspace_connections (workspace_id, connection_id, channel, status)
        VALUES ('shop-a', 'disabled-web', 'web', 'disabled');
    `);
    const configurationStatements: string[] = [];
    const config = new PostgresWebChatConfiguration(runtimePort(database, configurationStatements));
    assert.equal(await config.resolveConnection("missing", "web"), null);
    assert.equal(await config.resolveConnection("disabled-web", "web"), null);
    assert.equal(await config.resolveConnection("line-a", "web"), null);
    assert.deepEqual(await config.resolveConnection("web-b", "web"), shopB);
    assert.deepEqual(await config.allowedOrigins(shopA), ["https://shop-a.example"]);
    assert.deepEqual(await config.allowedOrigins(shopB), ["https://shop-b.example"]);
    assert.deepEqual(await config.queryAliases(shopA), [["ส่งของ", "จัดส่ง"]]);
    assert.deepEqual(await config.queryAliases(shopB), []);
    assert.equal(configurationStatements.filter((sql) => sql === "BEGIN").length, 0, "configuration reads do not open a transaction");
    assert.equal(configurationStatements.length, 8, "each valid read is one database command");
    assert.equal(configurationStatements.some((sql) => sql.includes("set_config('app.workspace_id'")), false);
    const runtime = runtimePort(database);
    await assert.rejects(runtime.transaction((query) => query.query("UPDATE aicp.workspace_connections SET allowed_origins = ARRAY['https://evil.example'] WHERE connection_id = 'web-a'")));
    await assert.rejects(runtime.transaction((query) => query.query("INSERT INTO aicp.workspace_connections (workspace_id, connection_id, channel) VALUES ('shop-a','web-x','web')")));
    await assert.rejects(runtime.transaction((query) => query.query("UPDATE aicp.workspaces SET query_aliases = '[]'::jsonb WHERE workspace_id = 'shop-a'")));
    assert.deepEqual((await database.query<{ can_select: boolean; can_insert: boolean; can_update: boolean }>(`
      SELECT has_column_privilege('knowledge_runtime', 'aicp.workspace_connections', 'allowed_origins', 'SELECT') AS can_select,
             has_column_privilege('knowledge_runtime', 'aicp.workspace_connections', 'allowed_origins', 'INSERT') AS can_insert,
             has_column_privilege('knowledge_runtime', 'aicp.workspace_connections', 'allowed_origins', 'UPDATE') AS can_update
    `)).rows[0], { can_select: true, can_insert: false, can_update: false });
    assert.equal((await database.query<{ can_select: boolean }>("SELECT has_table_privilege('anon','aicp.workspace_connections','SELECT') AS can_select")).rows[0]?.can_select, false);
    await assert.rejects(database.exec("UPDATE aicp.workspaces SET query_aliases = '{}'::jsonb WHERE workspace_id = 'shop-a'"));
  } finally { await database.close(); }
});
test("web chat route responds 503 when its signing secret is missing", async () => {
  register("data:text/javascript,export async function resolve(specifier, context, nextResolve) { if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }; return nextResolve(specifier); }", import.meta.url);
  const previous = process.env.WEB_CHAT_SESSION_SECRET;
  delete process.env.WEB_CHAT_SESSION_SECRET;
  try {
    const { GET } = await import("../../../apps/merchant-console/app/chat/route.js");
    for (const value of [undefined, "short"]) {
      if (value === undefined) delete process.env.WEB_CHAT_SESSION_SECRET;
      else process.env.WEB_CHAT_SESSION_SECRET = value;
      const response = await GET(new Request("http://localhost/chat?c=web-a"));
      assert.equal(response.status, 503);
    }
  } finally {
    if (previous === undefined) delete process.env.WEB_CHAT_SESSION_SECRET;
    else process.env.WEB_CHAT_SESSION_SECRET = previous;
  }
});

test("real host answers approved knowledge and persists customer handoff to its outbox", async () => {
  register("data:text/javascript,export async function resolve(specifier, context, nextResolve) { if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }; return nextResolve(specifier); }", import.meta.url);
  const database = await createMigratedDatabase();
  const previousSecret = process.env.WEB_CHAT_SESSION_SECRET;
  try {
    await database.exec("UPDATE aicp.workspace_connections SET allowed_origins = ARRAY['https://shop-a.example'] WHERE connection_id = 'web-a'");
    const repository = new PostgresKnowledgeRepository(runtimePort(database), NO_ACTOR_FOR_SCHEMA_TESTS);
    await addApprovedFaq(repository, database, shopA, "shipping", "จัดส่งใช้เวลา 2 วันทำการ", "customer");
    await addApprovedFaq(repository, database, shopA, "internal", "ส่งของ VIP ใช้เวลา 30 นาที", "internal");
    await database.exec(`UPDATE aicp.workspaces SET query_aliases = '[["ส่งของ","จัดส่ง"]]'::jsonb WHERE workspace_id = 'shop-a'`);
    const { createWebChatRealHost } = await import("../../../composition/web-chat-real-host.js");
    const countedStatements: string[] = [];
    const host = await createWebChatRealHost(client(database, countedStatements));
    const citation = { workspaceId: "shop-a", sourceId: "shipping", sourceVersionId: "v1", chunkId: "shipping:v1:0", locator: { kind: "span", chunkIndex: 0, start: 0, end: 1 } } as KnowledgeCitation;
    assert.deepEqual(await host.describeCitation(shopA, citation), { title: "shipping" });
    assert.equal(await host.describeCitation(shopA, { ...citation, sourceId: "internal", chunkId: "internal:v1:0" }), null);
    countedStatements.length = 0;
    assert.deepEqual(await host.describeCitations!(shopA, [citation, { ...citation, workspaceId: "shop-b" }, citation]), [
      { title: "shipping" }, null, { title: "shipping" },
    ]);
    assert.equal(countedStatements.filter((sql) => sql === "BEGIN").length, 1, "citation title lookup uses one scoped read for every row");
    const routes = createWebChatRoutes({
      messageEndpoint: "/chat/message", resolveConnection: host.resolveConnection, allowedOrigins: host.allowedOrigins,
      sessionSecret: secret, responder: host.responder, requestHandoff: host.requestHandoff,
      persistTurn: host.persistTurn, staffUpdates: host.staffUpdates,
      describeCitation: host.describeCitation, describeCitations: host.describeCitations, clientKey: () => "test-client",
    });
    process.env.WEB_CHAT_SESSION_SECRET = secret;
    (globalThis as typeof globalThis & { __webChatRoutes?: Promise<ReturnType<typeof createWebChatRoutes>> }).__webChatRoutes = Promise.resolve(routes);
    const [{ GET }, { POST }] = await Promise.all([
      import("../../../apps/merchant-console/app/chat/route.js"),
      import("../../../apps/merchant-console/app/chat/message/route.js"),
    ]);
    const page = await GET(new Request("http://localhost/chat?c=web-a"));
    assert.equal(page.status, 200);
    const session = cookie(page);
    const crossWorkspace = await POST(new Request("http://localhost/chat/message", {
      method: "POST", headers: { cookie: session, origin: "https://shop-a.example", "content-type": "application/json" },
      body: JSON.stringify({ connectionId: "web-b", text: "ส่งของใช้เวลากี่วัน" }),
    }));
    assert.equal(crossWorkspace.status, 401);
    countedStatements.length = 0;
    const aliasAnswer = await POST(chatRequest("ส่งของใช้เวลากี่วัน", session));
    const closedFlagCommands = countedStatements.length;
    const closedFlagTransactions = countedStatements.filter((sql) => sql === "BEGIN").length;
    assert.ok(closedFlagCommands <= 37, `flag-off DB command ceiling: ${closedFlagCommands}`);
    console.log("CHAT_DB_COMMANDS_FLAG_OFF", closedFlagCommands, closedFlagTransactions);
    const answerBody = await aliasAnswer.json() as { kind: string; text?: string };
    assert.equal(answerBody.kind, "answer");
    assert.match(answerBody.text ?? "", /จัดส่งใช้เวลา 2 วันทำการ/u);
    const denied = await POST(chatRequest("ส่งของใช้เวลากี่วัน", session, "https://foreign.example"));
    assert.equal(denied.status, 403);
    const unknown = await POST(chatRequest("ข้อมูลที่ไม่มีในเอกสาร" , session));
    assert.equal((await unknown.json() as { kind: string }).kind, "uncertain");
    const signedSession = inspectSessionCookie(session, secret);
    assert.ok(signedSession);
    const staff = new HandoffService(runtimePort(database));
    await staff.claim(shopA, STAFF_A, signedSession.conversationId);
    const customerWhileHumanActive = await POST(chatRequest("ขอถามอีกเรื่องระหว่างรอ", session));
    assert.equal((await customerWhileHumanActive.json() as { kind: string }).kind, "uncertain");
    const retainedCustomer = await database.query<{ count: number }>("SELECT count(*)::int AS count FROM aicp.conversation_messages WHERE workspace_id='shop-a' AND conversation_id=$1 AND role='customer' AND body='ขอถามอีกเรื่องระหว่างรอ'", [signedSession.conversationId]);
    assert.equal(retainedCustomer.rows[0]?.count, 1);
    await staff.reply(shopA, STAFF_A, signedSession.conversationId, "พนักงานรับเรื่องแล้ว", "staff-delivery-1");
    const updates = await routes.updates(new Request("http://localhost/chat/updates", { headers: { cookie: session, "sec-fetch-site": "same-origin" } }));
    assert.deepEqual((await updates.json() as { data: Array<{ text: string }> }).data.map((item) => item.text), ["พนักงานรับเรื่องแล้ว"]);
    const handoff = await POST(new Request("http://localhost/chat/message", {
      method: "POST", headers: { cookie: session, origin: "https://shop-a.example", "content-type": "application/json" },
      body: JSON.stringify({ connectionId: "web-a", action: "handoff" }),
    }));
    assert.equal(handoff.status, 200);
    assert.equal((await handoff.json() as { kind: string }).kind, "handoff_recorded");
    await host.requestHandoff(shopA, "conversation-id");
    const notifications = await database.query<{ count: number }>("SELECT count(*)::int AS count FROM aicp.handoff_notifications WHERE workspace_id = 'shop-a'");
    assert.equal(notifications.rows[0]?.count, 1);
    const internalOnly = await POST(chatRequest("ส่งของ VIP ใช้เวลาเท่าไหร่", session));
    const internalReply = await internalOnly.json() as { text?: string };
    assert.doesNotMatch(internalReply.text ?? "", /30 นาที/u);
    await database.exec("UPDATE aicp.workspace_connections SET allowed_origins = '{}' WHERE connection_id = 'web-a'");
    const emptyOrigins = await POST(chatRequest("ส่งของใช้เวลากี่วัน", session));
    assert.equal(emptyOrigins.status, 403);
  } finally {
    if (previousSecret === undefined) delete process.env.WEB_CHAT_SESSION_SECRET;
    else process.env.WEB_CHAT_SESSION_SECRET = previousSecret;
    delete (globalThis as typeof globalThis & { __webChatRoutes?: Promise<ReturnType<typeof createWebChatRoutes>> }).__webChatRoutes;
    await database.close();
  }
});
