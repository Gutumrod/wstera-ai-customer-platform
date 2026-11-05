import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migrationNames = [
  "20261022000100_knowledge.sql",
  "20261023000100_g1_workspace_host.sql",
  "20261103000100_host_hardening.sql",
  "20261103000200_host_hardening_revoke.sql",
  "20261104000100_knowledge_visibility.sql",
];
const migrationPaths = migrationNames.map((name) => resolve(process.cwd(), "supabase/migrations", name));
const mirroredKnowledgePath = resolve(process.cwd(), "platform/adapters/persistence/postgres/migrations/001-knowledge.sql");
const OWNER = "00000000-0000-0000-0000-000000000001";
const OUTSIDER = "00000000-0000-0000-0000-000000000002";

async function bootstrapHosted(database: PGlite) {
  await database.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    INSERT INTO auth.users (id) VALUES ('${OWNER}'), ('${OUTSIDER}');
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL,
      file_size_limit bigint NOT NULL, allowed_mime_types text[]
    );
    CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text NOT NULL, name text NOT NULL);
    CREATE FUNCTION storage.foldername(object_name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
      SELECT string_to_array(regexp_replace(object_name, '/[^/]*$', ''), '/')
    $$;
    INSERT INTO storage.buckets VALUES ('knowledge-originals', 'knowledge-originals', false, 5242880, NULL);
    CREATE ROLE hosted_postgres NOLOGIN CREATEROLE BYPASSRLS;
    GRANT CREATE ON DATABASE postgres TO hosted_postgres;
    GRANT USAGE ON SCHEMA auth TO hosted_postgres;
    GRANT REFERENCES ON auth.users TO hosted_postgres;
    GRANT INSERT, UPDATE ON storage.buckets TO hosted_postgres;
    GRANT USAGE ON SCHEMA storage TO hosted_postgres;
  `);
}

async function runAsHosted(database: PGlite, sql: string, label: string, notices: string[]) {
  await database.exec("SET SESSION AUTHORIZATION hosted_postgres");
  const identity = await database.query<{ session_user: string; current_user: string }>(
    "SELECT session_user, current_user",
  );
  assert.deepEqual(identity.rows[0], { session_user: "hosted_postgres", current_user: "hosted_postgres" }, `${label} runs as hosted_postgres`);
  await database.exec(sql, { onNotice: (notice) => notices.push(notice.message ?? "") });
  await database.exec("RESET SESSION AUTHORIZATION");
}

test("all Supabase migrations and seed writes work as hosted postgres without weakening tenant authorization", async () => {
  const [migrationSql, mirroredKnowledge] = await Promise.all([
    Promise.all(migrationPaths.map((path) => readFile(path, "utf8"))),
    readFile(mirroredKnowledgePath, "utf8"),
  ]);
  assert.equal(migrationSql[0], mirroredKnowledge, "the Supabase base migration must match the tested PostgreSQL migration");

  const database = new PGlite();
  const notices: string[] = [];
  try {
    await bootstrapHosted(database);
    for (let index = 0; index < migrationSql.length; index += 1) {
      await runAsHosted(database, migrationSql[index]!, migrationNames[index]!, notices);
    }
    assert.equal(notices.some((notice) => /no privileges were granted/i.test(notice)), false, notices.join("\n"));

    const actorRole = await database.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>(
      "SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'aicp_migrator'",
    );
    assert.deepEqual(actorRole.rows[0], { rolsuper: false, rolbypassrls: false, rolcanlogin: false });

    const migrationRolePrivileges = await database.query<{ can_set: boolean; has_admin: boolean }>(
      `SELECT pg_has_role('hosted_postgres', 'aicp_migrator', 'MEMBER') AS can_set,
              pg_has_role('hosted_postgres', 'aicp_migrator', 'SET') AS has_admin`,
    );
    assert.deepEqual(migrationRolePrivileges.rows[0], { can_set: false, has_admin: false });

    await runAsHosted(database, `
      INSERT INTO aicp.workspaces (workspace_id, name, status)
      VALUES ('shop-a', 'Synthetic A', 'active'), ('shop-b', 'Synthetic B', 'active');
      INSERT INTO aicp.workspace_memberships (workspace_id, user_id, role, status)
      VALUES ('shop-a', '${OWNER}', 'owner', 'active');
      INSERT INTO aicp.workspace_connections (workspace_id, connection_id, channel, status)
      VALUES ('shop-a', 'synthetic-web', 'web', 'active');
    `, "seed writes", notices);

    const runtimePrivileges = await database.query<{ workspace_insert: boolean; membership_insert: boolean; authenticated_insert: boolean }>(`
      SELECT has_table_privilege('knowledge_runtime', 'aicp.workspaces', 'INSERT') AS workspace_insert,
             has_table_privilege('knowledge_runtime', 'aicp.workspace_memberships', 'INSERT') AS membership_insert,
             has_table_privilege('authenticated', 'aicp.workspace_memberships', 'INSERT') AS authenticated_insert
    `);
    assert.deepEqual(runtimePrivileges.rows[0], { workspace_insert: false, membership_insert: false, authenticated_insert: false });

    await database.exec(`
      CREATE FUNCTION pg_temp.set_actor(actor text) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM set_config('request.jwt.claim.sub', actor, true);
      END $$;
    `);
    await database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [OWNER]);
      await transaction.query(`
        INSERT INTO aicp.knowledge_sources (workspace_id, source_id, kind, title, created_at)
        VALUES ('shop-a', 'source-a', 'faq', 'Synthetic FAQ', now())
      `);
    });
    await database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [OUTSIDER]);
      await assert.rejects(transaction.query("SELECT aicp.approve_knowledge_version('shop-a', 'source-a', 'version-a')"),
        (error: unknown) => (error as { message?: string }).message?.includes("MEMBERSHIP_REQUIRED"));
    });
    await database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [OWNER]);
      const otherWorkspace = await transaction.query("SELECT workspace_id FROM aicp.workspaces WHERE workspace_id = 'shop-b'");
      assert.deepEqual(otherWorkspace.rows, [], "authenticated RLS must hide another workspace");
    });

    await database.exec("SET SESSION AUTHORIZATION hosted_postgres");
    const seedSession = await database.query<{ session_user: string; current_user: string }>("SELECT session_user, current_user");
    assert.deepEqual(seedSession.rows[0], { session_user: "hosted_postgres", current_user: "hosted_postgres" });
    await database.exec("ALTER ROLE knowledge_runtime LOGIN PASSWORD 'synthetic-test-password'");
    await database.exec("RESET SESSION AUTHORIZATION");
  } finally {
    await database.close();
  }
});

test("the five Supabase migrations remain applicable on a local superuser", async () => {
  const migrations = await Promise.all(migrationPaths.map((path) => readFile(path, "utf8")));
  const database = new PGlite();
  try {
    await database.exec(`
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL, file_size_limit bigint NOT NULL, allowed_mime_types text[]);
      CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text NOT NULL, name text NOT NULL);
      CREATE FUNCTION storage.foldername(object_name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(object_name, '/') $$;
    `);
    for (const migration of migrations) await database.exec(migration);
  } finally {
    await database.close();
  }
});
