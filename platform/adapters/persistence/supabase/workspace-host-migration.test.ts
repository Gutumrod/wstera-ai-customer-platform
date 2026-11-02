import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { PostgresDatabasePort, PostgresQueryPort, PostgresRow } from "../postgres/knowledge-repository.js";
import { PostgresKnowledgeIntakeAudit } from "../postgres/knowledge-intake-audit.js";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";

const basePath = resolve(process.cwd(), "platform/adapters/persistence/postgres/migrations/001-knowledge.sql");
const mirroredBasePath = resolve(process.cwd(), "supabase/migrations/20261022000100_knowledge.sql");
const hostPath = resolve(process.cwd(), "supabase/migrations/20261023000100_g1_workspace_host.sql");

function runtimePort(database: PGlite): PostgresDatabasePort {
  return {
    async transaction<T>(operation: (query: PostgresQueryPort) => Promise<T>): Promise<T> {
      return database.transaction(async (transaction) => {
        await transaction.exec("SET LOCAL ROLE knowledge_runtime");
        const port: PostgresQueryPort = {
          async query<Row extends PostgresRow = PostgresRow>(sql: string, values: readonly unknown[] = []) {
            const result = await transaction.query<Row>(sql, [...values]);
            return { rows: result.rows };
          },
        };
        return operation(port);
      });
    },
  };
}

test("Supabase local migrations stay in sync and enforce workspace membership/storage RLS", async () => {
  const [baseMigration, mirroredBase, hostMigration] = await Promise.all([
    readFile(basePath, "utf8"), readFile(mirroredBasePath, "utf8"), readFile(hostPath, "utf8"),
  ]);
  assert.equal(mirroredBase, baseMigration, "Supabase local base migration must mirror the tested PostgreSQL migration");

  const database = new PGlite();
  try {
    await database.exec(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (
        id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL,
        file_size_limit bigint NOT NULL, allowed_mime_types text[]
      );
      CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text NOT NULL, name text NOT NULL);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(object_name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
        SELECT string_to_array(regexp_replace(object_name, '/[^/]*$', ''), '/')
      $$;
      GRANT USAGE ON SCHEMA storage TO authenticated;
      GRANT SELECT ON storage.objects TO authenticated;
      GRANT INSERT, DELETE ON storage.objects TO authenticated;
    `);
    await database.exec(baseMigration);
    await database.exec(hostMigration);
    const publicTables = await database.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    assert.deepEqual(publicTables.rows, [], "product migrations must leave public without tables");
    await database.exec(`
      INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-000000000001');
      INSERT INTO aicp.workspaces (workspace_id, name, status) VALUES ('shop-a', 'Shop A', 'active'), ('shop-b', 'Shop B', 'active'), ('shop-suspended', 'Suspended', 'suspended');
      INSERT INTO aicp.workspace_memberships (workspace_id, user_id, role)
      VALUES ('shop-a', '00000000-0000-0000-0000-000000000001', 'owner');
      INSERT INTO aicp.workspace_memberships (workspace_id, user_id, role)
      VALUES ('shop-suspended', '00000000-0000-0000-0000-000000000001', 'owner');
      INSERT INTO aicp.workspace_connections (workspace_id, connection_id, channel)
      VALUES ('shop-a', 'web-a', 'web'), ('shop-b', 'web-b', 'web');
    `);

    const role = await database.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolreplication: boolean; rolinherit: boolean }>(
      "SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolinherit FROM pg_roles WHERE rolname = 'knowledge_runtime'",
    );
    assert.deepEqual(role.rows[0], {
      rolsuper: false, rolbypassrls: false, rolcreatedb: false,
      rolcreaterole: false, rolreplication: false, rolinherit: false,
    });
    const migrator = await database.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean; rolreplication: boolean; rolinherit: boolean; rolcanlogin: boolean }>(
      "SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolinherit, rolcanlogin FROM pg_roles WHERE rolname = 'aicp_migrator'",
    );
    assert.deepEqual(migrator.rows[0], {
      rolsuper: false, rolbypassrls: false, rolcreatedb: false,
      rolcreaterole: false, rolreplication: false, rolinherit: false, rolcanlogin: false,
    });
    const schemaOwner = await database.query<{ owner: string }>(
      "SELECT r.rolname AS owner FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner WHERE n.nspname = 'aicp'",
    );
    assert.deepEqual(schemaOwner.rows[0], { owner: "aicp_migrator" });
    const relationOwners = await database.query<{ owner: string }>(
      `SELECT DISTINCT r.rolname AS owner
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_roles r ON r.oid = c.relowner
       WHERE n.nspname = 'aicp' AND c.relkind IN ('r', 'p', 'i', 'S') ORDER BY owner`,
    );
    assert.deepEqual(relationOwners.rows, [{ owner: "aicp_migrator" }]);
    const functionOwners = await database.query<{ function_name: string; owner: string }>(
      `SELECT p.proname AS function_name, r.rolname AS owner
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
       WHERE n.nspname = 'aicp' ORDER BY p.proname`,
    );
    assert.deepEqual(functionOwners.rows, [
      { function_name: "guard_knowledge_chunk_insert", owner: "aicp_migrator" },
      { function_name: "is_active_workspace_member", owner: "aicp_migrator" },
      { function_name: "protect_knowledge_version_identity", owner: "aicp_migrator" },
    ]);
    const quarantinePrivileges = await database.query<{ can_select: boolean; can_insert: boolean }>(
      `SELECT has_table_privilege('knowledge_runtime', 'aicp.knowledge_quarantine_records', 'SELECT') AS can_select,
              has_table_privilege('knowledge_runtime', 'aicp.knowledge_quarantine_records', 'INSERT') AS can_insert`,
    );
    assert.deepEqual(quarantinePrivileges.rows[0], { can_select: true, can_insert: true });

    const ownRows = await database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", ["00000000-0000-0000-0000-000000000001"]);
      return transaction.query("SELECT workspace_id FROM aicp.workspace_memberships");
    });
    assert.deepEqual(ownRows.rows, [{ workspace_id: "shop-a" }]);
    const activeWorkspaceRows = await database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", ["00000000-0000-0000-0000-000000000001"]);
      return transaction.query("SELECT workspace_id FROM aicp.workspaces ORDER BY workspace_id");
    });
    assert.deepEqual(activeWorkspaceRows.rows, [{ workspace_id: "shop-a" }], "suspended workspaces must not resolve");

    await assert.rejects(database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", ["00000000-0000-0000-0000-000000000001"]);
      await transaction.query("INSERT INTO storage.objects (id, bucket_id, name) VALUES ($1, $2, $3)",
        ["00000000-0000-0000-0000-000000000011", "knowledge-originals", "shop-a/source-1/version-1/terms.pdf"]);
    }), (error: unknown) => (error as { code?: string }).code === "42501");
    await assert.rejects(database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", ["00000000-0000-0000-0000-000000000001"]);
      await transaction.query("INSERT INTO storage.objects (id, bucket_id, name) VALUES ($1, $2, $3)",
        ["00000000-0000-0000-0000-000000000012", "knowledge-originals", "shop-b/source-1/version-1/terms.pdf"]);
    }), (error: unknown) => (error as { code?: string }).code === "42501");
    const directStorageAccess = await database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", ["00000000-0000-0000-0000-000000000001"]);
      const rows = await transaction.query("SELECT name FROM storage.objects");
      const deleted = await transaction.query("DELETE FROM storage.objects WHERE name = $1 RETURNING name", ["shop-a/source-1/version-1/terms.pdf"]);
      return { rows: rows.rows, deleted: deleted.rows };
    });
    assert.deepEqual(directStorageAccess, { rows: [], deleted: [] }, "authenticated staff cannot inspect or delete private originals directly");

    const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
    const shopB = createTrustedWorkspace({ workspaceId: "shop-b", connectionId: "web-b", channel: "web" });
    const audit = new PostgresKnowledgeIntakeAudit(runtimePort(database));
    await database.exec("INSERT INTO aicp.knowledge_sources (workspace_id, source_id, kind, title, created_at) " +
      "VALUES ('shop-a', 'source-original', 'pdf', 'Original', now())");
    await database.exec("INSERT INTO aicp.knowledge_versions " +
      "(workspace_id, source_id, version_id, kind, title, content, created_at) " +
      "VALUES ('shop-a', 'source-original', 'version-original', 'pdf', 'Original', 'synthetic', now())");
    const originalReference = {
      sourceId: "source-original",
      versionId: "version-original",
      objectPath: "shop-a/source-original/version-original/version-original.pdf",
      filename: "terms.pdf",
      contentType: "application/pdf",
      byteSize: 4,
    };
    await audit.recordOriginal(shopA, originalReference);
    await audit.recordOriginal(shopA, originalReference);
    await assert.rejects(audit.recordOriginal(shopA, { ...originalReference, objectPath: "shop-a/other/path/file.pdf" }),
      /KNOWLEDGE_ORIGINAL_REFERENCE_CONFLICT/);
    const quarantined = await audit.quarantine(shopA, {
      attemptId: "qat-synthetic-1",
      idempotencyKey: "synthetic-quarantine-0001",
      requestHash: "a".repeat(64),
      kind: "pdf",
      title: "Synthetic invalid PDF",
      filename: "invalid.pdf",
      contentType: "application/pdf",
      byteSize: 4,
      objectPath: "shop-a/quarantine/qat-synthetic-1/invalid.pdf",
      failureCode: "MALFORMED_FILE",
    });
    assert.equal(quarantined.failureCode, "MALFORMED_FILE");
    assert.equal((await audit.listQuarantine(shopB)).length, 0);
    assert.equal((await audit.quarantine(shopA, {
      attemptId: "qat-synthetic-1",
      idempotencyKey: "synthetic-quarantine-0001",
      requestHash: "a".repeat(64),
      kind: "pdf",
      title: "Synthetic invalid PDF",
      filename: "invalid.pdf",
      contentType: "application/pdf",
      byteSize: 4,
      objectPath: "shop-a/quarantine/qat-synthetic-1/invalid.pdf",
      failureCode: "MALFORMED_FILE",
    })).attemptId, quarantined.attemptId);
    await assert.rejects(audit.quarantine(shopA, {
      attemptId: "qat-synthetic-1",
      idempotencyKey: "synthetic-quarantine-0001",
      requestHash: "b".repeat(64),
      kind: "pdf",
      title: "Synthetic invalid PDF",
      byteSize: 4,
      failureCode: "MALFORMED_FILE",
    }), /KNOWLEDGE_QUARANTINE_IDEMPOTENCY_CONFLICT/);
  } finally {
    await database.close();
  }
});
