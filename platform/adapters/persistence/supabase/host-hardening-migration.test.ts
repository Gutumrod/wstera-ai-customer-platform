import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { KnowledgeError } from "../../../contracts/data/knowledge.js";
import { createFaqVersion } from "../../../modules/knowledge/index.js";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";
import { OWNER_A, OWNER_B, STAFF_A, asAuthenticated, createMigratedDatabase, runtimePort } from "../../../composition/testing/merchant-host-harness.js";
import { PostgresKnowledgeIntakeAudit } from "../postgres/knowledge-intake-audit.js";
import { PostgresKnowledgeRepository } from "../postgres/knowledge-repository.js";

const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
let database: PGlite;
let sequence = 0;

before(async () => { database = await createMigratedDatabase(); });
after(async () => { await database.close(); });

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const message = (expected: string) => (error: unknown) => (error as { message?: string }).message === expected;

async function indexedVersion(repository = new PostgresKnowledgeRepository(runtimePort(database), OWNER_A)) {
  sequence += 1;
  const sourceId = `source-${sequence}`;
  const versionId = `version-${sequence}`;
  await repository.createSource(shopA, { sourceId, title: "Synthetic", kind: "faq" });
  await repository.createVersion(shopA, createFaqVersion({ workspace: shopA, sourceId, versionId, title: "Synthetic", content: "ข้อมูลสังเคราะห์สำหรับทดสอบ" }));
  await repository.transitionVersion(shopA, sourceId, versionId, "validating");
  await repository.transitionVersion(shopA, sourceId, versionId, "extracting");
  await repository.transitionVersion(shopA, sourceId, versionId, "indexed");
  return { sourceId, versionId };
}

const approveAs = (userId: string | null, workspaceId: string, sourceId: string, versionId: string) =>
  asAuthenticated(database, userId, (query) => query("SELECT aicp.approve_knowledge_version($1, $2, $3)", [workspaceId, sourceId, versionId]));

test("M1: the ingest role cannot approve by any path", async () => {
  const { sourceId, versionId } = await indexedVersion();
  const runtime = runtimePort(database);
  const inScope = (sql: string) => runtime.transaction(async (query) => {
    await query.query("SELECT set_config('app.workspace_id', 'shop-a', true)");
    await query.query(sql, sql.includes("$1") ? [versionId] : []);
  });
  await assert.rejects(inScope("UPDATE aicp.knowledge_versions SET status = 'approved', approved_at = now(), approved_by = 'forged' WHERE version_id = $1"), code("42501"));
  await assert.rejects(inScope("UPDATE aicp.knowledge_versions SET status = 'approved' WHERE version_id = $1"), code("23514"));
  await assert.rejects(inScope(`SELECT aicp.approve_knowledge_version('shop-a', '${sourceId}', '${versionId}')`), code("42501"));
  await assert.rejects(new PostgresKnowledgeRepository(runtime, OWNER_A).approveVersion(shopA, sourceId, versionId, { approvedBy: OWNER_A }),
    (error: unknown) => error instanceof KnowledgeError && error.code === "CROSS_WORKSPACE_ACCESS_DENIED");
  const row = await database.query<{ status: string }>("SELECT status FROM aicp.knowledge_versions WHERE version_id = $1", [versionId]);
  assert.equal(row.rows[0]?.status, "indexed");
});

test("M1: approval takes the approver from auth.uid() and checks ownership in SQL", async () => {
  const { sourceId, versionId } = await indexedVersion();
  await assert.rejects(approveAs(null, "shop-a", sourceId, versionId), message("MEMBERSHIP_REQUIRED"));
  await assert.rejects(approveAs(STAFF_A, "shop-a", sourceId, versionId), message("OWNER_ROLE_REQUIRED"));
  await assert.rejects(approveAs(OWNER_B, "shop-a", sourceId, versionId), message("MEMBERSHIP_REQUIRED"));
  await assert.rejects(approveAs(OWNER_B, "shop-b", sourceId, versionId), message("SOURCE_NOT_FOUND"));
  await assert.rejects(approveAs(OWNER_A, "shop-a", sourceId, "version-missing"), message("VERSION_NOT_FOUND"));

  await approveAs(OWNER_A, "shop-a", sourceId, versionId);
  const row = await database.query<{ status: string; approved_by: string }>("SELECT status, approved_by FROM aicp.knowledge_versions WHERE version_id = $1", [versionId]);
  assert.deepEqual(row.rows[0], { status: "approved", approved_by: OWNER_A });
  await assert.rejects(approveAs(OWNER_A, "shop-a", sourceId, versionId), message("APPROVAL_NOT_ELIGIBLE"));

  const repository = new PostgresKnowledgeRepository(runtimePort(database), OWNER_A);
  await repository.createVersion(shopA, createFaqVersion({ workspace: shopA, sourceId, versionId: "second", title: "Synthetic", content: "ข้อมูลรุ่นที่สอง" }));
  for (const next of ["validating", "extracting", "indexed"] as const) await repository.transitionVersion(shopA, sourceId, "second", next);
  await assert.rejects(approveAs(OWNER_A, "shop-a", sourceId, "second"), message("APPROVED_VERSION_EXISTS"));

  const archived = await indexedVersion();
  await repository.archiveSource(shopA, archived.sourceId);
  await assert.rejects(approveAs(OWNER_A, "shop-a", archived.sourceId, archived.versionId), message("APPROVAL_NOT_ELIGIBLE"));
});

test("revalidation: every repository and audit write re-checks membership in its own transaction", async () => {
  const seeded = await indexedVersion();
  const statements: string[] = [];
  const port = runtimePort(database, statements);
  const member = new PostgresKnowledgeRepository(port, STAFF_A);
  await member.createSource(shopA, { sourceId: "guarded", title: "Guarded", kind: "faq" });
  assert.match(statements.join("\n"), /assert_active_knowledge_writer/);

  await database.query("UPDATE aicp.workspace_memberships SET status = 'revoked' WHERE user_id = $1", [STAFF_A]);
  const revoked = new PostgresKnowledgeRepository(port, STAFF_A);
  const audit = new PostgresKnowledgeIntakeAudit(port, STAFF_A);
  const denied = (error: unknown) => error instanceof KnowledgeError && error.code === "MEMBERSHIP_REQUIRED";
  const before = await database.query("SELECT (SELECT count(*) FROM aicp.knowledge_sources) AS a, (SELECT count(*) FROM aicp.knowledge_versions) AS b, (SELECT count(*) FROM aicp.knowledge_quarantine_records) AS c");

  await assert.rejects(revoked.createSource(shopA, { sourceId: "forbidden", title: "Forbidden", kind: "faq" }), denied);
  await assert.rejects(revoked.createVersion(shopA, createFaqVersion({ workspace: shopA, sourceId: "guarded", versionId: "forbidden", title: "Guarded", content: "ห้ามเขียน" })), denied);
  await assert.rejects(revoked.transitionVersion(shopA, seeded.sourceId, seeded.versionId, "failed"), denied);
  await assert.rejects(revoked.archiveSource(shopA, "guarded"), denied);
  await assert.rejects(revoked.approveVersion(shopA, seeded.sourceId, seeded.versionId, { approvedBy: STAFF_A }), denied);
  await assert.rejects(revoked.revokeVersion(shopA, seeded.sourceId, seeded.versionId, { revokedBy: STAFF_A, reason: "synthetic" }), denied);
  await assert.rejects(audit.recordOriginal(shopA, {
    sourceId: seeded.sourceId, versionId: seeded.versionId, objectPath: "shop-a/x/y/z.pdf", filename: "z.pdf", contentType: "application/pdf", byteSize: 1,
  }), denied);
  await assert.rejects(audit.quarantine(shopA, {
    attemptId: "qat-forbidden", idempotencyKey: "synthetic-forbidden", requestHash: "a".repeat(64), kind: "pdf", title: "Forbidden", byteSize: 1, failureCode: "MALFORMED_FILE",
  }), denied);

  const afterWrites = await database.query("SELECT (SELECT count(*) FROM aicp.knowledge_sources) AS a, (SELECT count(*) FROM aicp.knowledge_versions) AS b, (SELECT count(*) FROM aicp.knowledge_quarantine_records) AS c");
  assert.deepEqual(afterWrites.rows, before.rows);
  await database.query("UPDATE aicp.workspace_memberships SET status = 'active' WHERE user_id = $1", [STAFF_A]);

  const wrongWorkspace = new PostgresKnowledgeRepository(port, OWNER_B);
  await assert.rejects(wrongWorkspace.createSource(shopA, { sourceId: "cross", title: "Cross", kind: "faq" }), denied);
});

test("revalidation function locks the rows it reads and stays out of reach of request-facing roles", async () => {
  const definition = await database.query<{ definition: string; secdef: boolean }>(
    "SELECT pg_get_functiondef(p.oid) AS definition, p.prosecdef AS secdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'aicp' AND p.proname = 'assert_active_knowledge_writer'");
  assert.equal(definition.rows[0]?.secdef, true);
  assert.match(definition.rows[0]?.definition ?? "", /FOR SHARE OF membership, workspace/);
  await assert.rejects(asAuthenticated(database, OWNER_A, (query) => query("SELECT aicp.assert_active_knowledge_writer('shop-a', $1)", [OWNER_A])), code("42501"));
  await assert.rejects(runtimePort(database).transaction((query) => query.query("SELECT * FROM aicp.workspace_memberships")), code("42501"));
});

test("M3: members read only web connections, so LINE channel ids stay hidden", async () => {
  const rows = await asAuthenticated(database, STAFF_A, (query) => query("SELECT connection_id, channel FROM aicp.workspace_connections ORDER BY connection_id"));
  assert.deepEqual(rows.rows, [{ connection_id: "web-a", channel: "web" }]);
  const owner = await asAuthenticated(database, OWNER_A, (query) => query("SELECT connection_id FROM aicp.workspace_connections"));
  assert.deepEqual(owner.rows, [{ connection_id: "web-a" }]);
});

test("a workspace can hold only one active web connection", async () => {
  await assert.rejects(database.query("INSERT INTO aicp.workspace_connections (workspace_id, connection_id, channel) VALUES ('shop-a', 'web-a-2', 'web')"), code("23505"));
  await database.query("INSERT INTO aicp.workspace_connections (workspace_id, connection_id, channel, status) VALUES ('shop-a', 'web-a-old', 'web', 'disabled')");
  await database.query("DELETE FROM aicp.workspace_connections WHERE connection_id = 'web-a-old'");
});

test("hardening objects stay in aicp, owned by the product migrator", async () => {
  const tables = await database.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  assert.deepEqual(tables.rows, []);
  const functions = await database.query<{ proname: string; owner: string; schema: string }>(
    `SELECT p.proname, r.rolname AS owner, n.nspname AS schema FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
     WHERE p.proname IN ('approve_knowledge_version', 'assert_active_knowledge_writer') ORDER BY p.proname`);
  assert.deepEqual(functions.rows, [
    { proname: "approve_knowledge_version", owner: "aicp_migrator", schema: "aicp" },
    { proname: "assert_active_knowledge_writer", owner: "aicp_migrator", schema: "aicp" },
  ]);
});
