import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { KnowledgeError } from "../../../contracts/data/knowledge.js";
import { createFaqVersion } from "../../../modules/knowledge/index.js";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";
import { OWNER_A, OWNER_B, STAFF_A, asAuthenticated, authenticatedRpcClient, createMigratedDatabase, runtimePort } from "../../../composition/testing/merchant-host-harness.js";
import { PostgresKnowledgeIntakeAudit } from "../postgres/knowledge-intake-audit.js";
import { PostgresKnowledgeRepository } from "../postgres/knowledge-repository.js";
import { SupabaseKnowledgeRevocation } from "./knowledge-revocation.js";

const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
let database: PGlite;
let sequence = 0;

before(async () => { database = await createMigratedDatabase(); });
after(async () => { await database.close(); });

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const message = (expected: string) => (error: unknown) => (error as { message?: string }).message === expected;
const denied = (error: unknown) => error instanceof KnowledgeError && error.code === "MEMBERSHIP_REQUIRED";

const approveAs = (userId: string | null, workspaceId: string, sourceId: string, versionId: string) =>
  asAuthenticated(database, userId, (query) => query("SELECT aicp.approve_knowledge_version($1, $2, $3)", [workspaceId, sourceId, versionId]));
const revokeAs = (userId: string | null, workspaceId: string, sourceId: string, versionId: string, reason = "synthetic reason") =>
  asAuthenticated(database, userId, (query) => query("SELECT aicp.revoke_knowledge_version($1, $2, $3, $4)", [workspaceId, sourceId, versionId, reason]));
const archiveAs = (userId: string | null, workspaceId: string, sourceId: string) =>
  asAuthenticated(database, userId, (query) => query("SELECT aicp.archive_knowledge_source($1, $2)", [workspaceId, sourceId]));

async function approvedVersion() {
  sequence += 1;
  const sourceId = `rsource-${sequence}`;
  const versionId = `rversion-${sequence}`;
  const repository = new PostgresKnowledgeRepository(runtimePort(database), OWNER_A);
  await repository.createSource(shopA, { sourceId, title: "Synthetic", kind: "faq" });
  await repository.createVersion(shopA, createFaqVersion({ workspace: shopA, sourceId, versionId, title: "Synthetic", content: "ข้อมูลสังเคราะห์สำหรับทดสอบ" }));
  for (const next of ["validating", "extracting", "indexed"] as const) await repository.transitionVersion(shopA, sourceId, versionId, next);
  await approveAs(OWNER_A, "shop-a", sourceId, versionId);
  return { sourceId, versionId };
}

const versionRow = async (versionId: string) => (await database.query<{ status: string; revoked_by: string | null; revocation_reason: string | null }>(
  "SELECT status, revoked_by, revocation_reason FROM aicp.knowledge_versions WHERE version_id = $1", [versionId])).rows[0];

const asRuntime = (sql: string, values: unknown[] = []) => runtimePort(database).transaction(async (query) => {
  await query.query("SELECT set_config('app.workspace_id', 'shop-a', true)");
  await query.query(sql, values);
});

test("F1: the ingest role cannot revoke, forge revoked_by or archive by any path", async () => {
  const { sourceId, versionId } = await approvedVersion();
  await assert.rejects(asRuntime("UPDATE aicp.knowledge_versions SET status = 'revoked', revoked_at = now(), revoked_by = 'forged', revocation_reason = 'x' WHERE version_id = $1", [versionId]), code("42501"));
  await assert.rejects(asRuntime("UPDATE aicp.knowledge_versions SET revoked_by = 'forged' WHERE version_id = $1", [versionId]), code("42501"));
  // status alone cannot reach 'revoked': the CHECK needs revoked_* and the role no longer holds those columns.
  await assert.rejects(asRuntime("UPDATE aicp.knowledge_versions SET status = 'revoked' WHERE version_id = $1", [versionId]), code("23514"));
  await assert.rejects(asRuntime("UPDATE aicp.knowledge_sources SET status = 'archived' WHERE source_id = $1", [sourceId]), code("42501"));
  await assert.rejects(asRuntime(`SELECT aicp.revoke_knowledge_version('shop-a', '${sourceId}', '${versionId}', 'x')`), code("42501"));
  await assert.rejects(asRuntime(`SELECT aicp.archive_knowledge_source('shop-a', '${sourceId}')`), code("42501"));
  // The shared repository methods stay in place and now fail at the database under the runtime role.
  const repository = new PostgresKnowledgeRepository(runtimePort(database), OWNER_A);
  await assert.rejects(repository.revokeVersion(shopA, sourceId, versionId, { revokedBy: OWNER_B, reason: "forged" }),
    (error: unknown) => error instanceof KnowledgeError && error.code === "CROSS_WORKSPACE_ACCESS_DENIED");
  await assert.rejects(repository.archiveSource(shopA, sourceId),
    (error: unknown) => error instanceof KnowledgeError && error.code === "CROSS_WORKSPACE_ACCESS_DENIED");
  assert.equal((await versionRow(versionId))?.status, "approved");
  const source = await database.query<{ status: string }>("SELECT status FROM aicp.knowledge_sources WHERE source_id = $1", [sourceId]);
  assert.equal(source.rows[0]?.status, "active");
});

test("F1: the owner revokes through the signed-in path and revoked_by comes from auth.uid()", async () => {
  const { sourceId, versionId } = await approvedVersion();
  await assert.rejects(revokeAs(null, "shop-a", sourceId, versionId), message("MEMBERSHIP_REQUIRED"));
  await assert.rejects(revokeAs(STAFF_A, "shop-a", sourceId, versionId), message("OWNER_ROLE_REQUIRED"));
  await assert.rejects(revokeAs(OWNER_B, "shop-a", sourceId, versionId), message("MEMBERSHIP_REQUIRED"));
  await assert.rejects(revokeAs(OWNER_B, "shop-b", sourceId, versionId), message("SOURCE_NOT_FOUND"));
  await assert.rejects(revokeAs(OWNER_A, "shop-a", sourceId, "version-missing"), message("VERSION_NOT_FOUND"));
  await assert.rejects(revokeAs(OWNER_A, "shop-a", sourceId, versionId, "   "), message("INVALID_KNOWLEDGE_INPUT"));
  await assert.rejects(revokeAs(OWNER_A, "shop-a", sourceId, versionId, "x".repeat(501)), message("INVALID_KNOWLEDGE_INPUT"));
  assert.equal((await versionRow(versionId))?.status, "approved");

  await revokeAs(OWNER_A, "shop-a", sourceId, versionId, "superseded");
  assert.deepEqual(await versionRow(versionId), { status: "revoked", revoked_by: OWNER_A, revocation_reason: "superseded" });
  await assert.rejects(revokeAs(OWNER_A, "shop-a", sourceId, versionId), message("REVOCATION_NOT_ELIGIBLE"));
});

test("F1: the owner archives through the signed-in path; members and other workspaces cannot", async () => {
  const { sourceId } = await approvedVersion();
  await assert.rejects(archiveAs(null, "shop-a", sourceId), message("MEMBERSHIP_REQUIRED"));
  await assert.rejects(archiveAs(STAFF_A, "shop-a", sourceId), message("OWNER_ROLE_REQUIRED"));
  await assert.rejects(archiveAs(OWNER_B, "shop-a", sourceId), message("MEMBERSHIP_REQUIRED"));
  await assert.rejects(archiveAs(OWNER_B, "shop-b", sourceId), message("SOURCE_NOT_FOUND"));
  await assert.rejects(archiveAs(OWNER_A, "shop-a", "source-missing"), message("SOURCE_NOT_FOUND"));
  const before = await database.query<{ status: string }>("SELECT status FROM aicp.knowledge_sources WHERE source_id = $1", [sourceId]);
  assert.equal(before.rows[0]?.status, "active");
  await archiveAs(OWNER_A, "shop-a", sourceId);
  const after = await database.query<{ status: string }>("SELECT status FROM aicp.knowledge_sources WHERE source_id = $1", [sourceId]);
  assert.equal(after.rows[0]?.status, "archived");
});

test("F1: the new functions are definer-owned, pinned to aicp and callable only by authenticated", async () => {
  const rows = await database.query<{ proname: string; owner: string; secdef: boolean; config: string[] | null; acl: string | null }>(
    `SELECT p.proname, r.rolname AS owner, p.prosecdef AS secdef, p.proconfig AS config, p.proacl::text AS acl
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
     WHERE n.nspname = 'aicp' AND p.proname IN ('revoke_knowledge_version', 'archive_knowledge_source') ORDER BY p.proname`);
  assert.equal(rows.rows.length, 2);
  for (const row of rows.rows) {
    assert.equal(row.owner, "aicp_migrator");
    assert.equal(row.secdef, true);
    assert.deepEqual(row.config, ["search_path=pg_catalog, aicp"]);
    assert.doesNotMatch(row.acl ?? "", /knowledge_runtime/);
    assert.match(row.acl ?? "", /authenticated=X/);
  }
});

test("F2: a repository or audit built without an actor cannot write", async () => {
  const port = runtimePort(database);
  const noActor = new PostgresKnowledgeRepository(port, undefined as unknown as string);
  const noActorAudit = new PostgresKnowledgeIntakeAudit(port, undefined as unknown as string);
  const count = () => database.query("SELECT (SELECT count(*) FROM aicp.knowledge_sources) AS a, (SELECT count(*) FROM aicp.knowledge_quarantine_records) AS c");
  const before = await count();
  await assert.rejects(noActor.createSource(shopA, { sourceId: "no-actor", title: "No actor", kind: "faq" }), denied);
  await assert.rejects(new PostgresKnowledgeRepository(port, "").createSource(shopA, { sourceId: "empty-actor", title: "Empty", kind: "faq" }), denied);
  await assert.rejects(noActorAudit.quarantine(shopA, {
    attemptId: "qat-no-actor", idempotencyKey: "synthetic-no-actor", requestHash: "a".repeat(64), kind: "pdf", title: "No actor", byteSize: 1, failureCode: "MALFORMED_FILE",
  }), denied);
  assert.deepEqual((await count()).rows, before.rows);
});

test("F2: a revoked membership is still refused when an actor is given", async () => {
  await database.query("UPDATE aicp.workspace_memberships SET status = 'revoked' WHERE user_id = $1", [OWNER_A]);
  try {
    await assert.rejects(new PostgresKnowledgeRepository(runtimePort(database), OWNER_A).createSource(shopA, { sourceId: "revoked-owner", title: "Revoked", kind: "faq" }), denied);
  } finally {
    await database.query("UPDATE aicp.workspace_memberships SET status = 'active' WHERE user_id = $1", [OWNER_A]);
  }
});

test("F2: production wiring passes the session actor and never touches the test opt-out", async () => {
  const source = await readFile("platform/composition/merchant-knowledge-host.ts", "utf8");
  assert.match(source, /new PostgresKnowledgeRepository\(database, actorUserId\)/);
  assert.match(source, /new PostgresKnowledgeIntakeAudit\(database, actorUserId\)/);
  assert.doesNotMatch(source, /SCHEMA_TESTS/);
});

test("F1: the lock-handle grant cannot rewrite a source", async () => {
  const { sourceId } = await approvedVersion();
  // Setting created_at to its own value is allowed (the trigger only rejects a changed value); changing it is not.
  await asRuntime("UPDATE aicp.knowledge_sources SET created_at = created_at WHERE source_id = $1", [sourceId]);
  await assert.rejects(asRuntime("UPDATE aicp.knowledge_sources SET created_at = created_at + interval '1 day' WHERE source_id = $1", [sourceId]), code("23514"));
  // title and status have no column grant, so the role is stopped by privileges before the trigger.
  await assert.rejects(asRuntime("UPDATE aicp.knowledge_sources SET title = 'renamed' WHERE source_id = $1", [sourceId]), code("42501"));
  await assert.rejects(asRuntime("UPDATE aicp.knowledge_sources SET status = 'archived' WHERE source_id = $1", [sourceId]), code("42501"));
  // The trigger itself, reached as a privileged role, rejects every identity column.
  for (const change of ["title = 'renamed'", "kind = 'csv'", "source_id = 'moved'", "workspace_id = 'shop-b'"]) {
    await assert.rejects(database.query(`UPDATE aicp.knowledge_sources SET ${change} WHERE source_id = $1`, [sourceId]), code("23514"));
  }
  // The row locks used by ingest still work for the runtime role.
  await asRuntime("SELECT 1 FROM aicp.knowledge_sources WHERE source_id = $1 FOR UPDATE", [sourceId]);
});

test("F1: the Supabase adapter maps RPC errors and revokes and archives as the signed-in owner", async () => {
  const { sourceId, versionId } = await approvedVersion();
  const adapter = (userId: string | null) => new SupabaseKnowledgeRevocation(authenticatedRpcClient(database, userId));
  const failsWith = (expected: string) => (error: unknown) => error instanceof KnowledgeError && error.code === expected;
  await assert.rejects(adapter(STAFF_A).revokeVersion(shopA, sourceId, versionId, "nope"), failsWith("OWNER_ROLE_REQUIRED"));
  await assert.rejects(adapter(STAFF_A).archiveSource(shopA, sourceId), failsWith("OWNER_ROLE_REQUIRED"));
  await assert.rejects(adapter(OWNER_B).revokeVersion(shopA, sourceId, versionId, "nope"), failsWith("MEMBERSHIP_REQUIRED"));
  await adapter(OWNER_A).revokeVersion(shopA, sourceId, versionId, "superseded");
  assert.deepEqual(await versionRow(versionId), { status: "revoked", revoked_by: OWNER_A, revocation_reason: "superseded" });
  await assert.rejects(adapter(OWNER_A).revokeVersion(shopA, sourceId, versionId, "again"), failsWith("REVOCATION_NOT_ELIGIBLE"));
  await adapter(OWNER_A).archiveSource(shopA, sourceId);
  const source = await database.query<{ status: string }>("SELECT status FROM aicp.knowledge_sources WHERE source_id = $1", [sourceId]);
  assert.equal(source.rows[0]?.status, "archived");
});
