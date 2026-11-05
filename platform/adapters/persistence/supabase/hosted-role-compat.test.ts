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

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "single" | "double" | null = null;
  let dollarTag: string | null = null;
  let lineComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index]!;
    const next = sql[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (quote === "single" || quote === "double") {
      const end = quote === "single" ? "'" : '"';
      if (character === end && next === end) index += 1;
      else if (character === end) quote = null;
      continue;
    }
    if (character === "-" && next === "-") {
      lineComment = true;
      index += 1;
    } else if (character === "'") quote = "single";
    else if (character === '"') quote = "double";
    else if (character === "$") {
      const tag = sql.slice(index).match(/^\$[A-Za-z_0-9]*\$/)?.[0];
      if (tag) {
        dollarTag = tag;
        index += tag.length - 1;
      }
    } else if (character === ";") {
      const statement = sql.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

async function bootstrapHosted(database: PGlite, unsafeRole?: "aicp_migrator" | "knowledge_runtime") {
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
    CREATE ROLE hosted_postgres NOLOGIN CREATEROLE BYPASSRLS;
    GRANT CREATE ON DATABASE postgres TO hosted_postgres;
    GRANT USAGE ON SCHEMA auth TO hosted_postgres;
    GRANT REFERENCES ON auth.users TO hosted_postgres;
    GRANT INSERT, UPDATE ON storage.buckets TO hosted_postgres;
    GRANT USAGE ON SCHEMA storage TO hosted_postgres;
  `);
  if (unsafeRole === "aicp_migrator") await database.exec("CREATE ROLE aicp_migrator NOLOGIN BYPASSRLS;");
  if (unsafeRole === "knowledge_runtime") await database.exec("CREATE ROLE knowledge_runtime NOLOGIN BYPASSRLS;");
}

async function runAsHosted(database: PGlite, sql: string, label: string, notices: string[]) {
  await database.exec("SET SESSION AUTHORIZATION hosted_postgres");
  const identity = await database.query<{ session_user: string; current_user: string }>(
    "SELECT session_user, current_user",
  );
  assert.deepEqual(identity.rows[0], { session_user: "hosted_postgres", current_user: "hosted_postgres" }, `${label} runs as hosted_postgres`);
  for (const statement of splitSqlStatements(sql)) {
    try {
      await database.exec(statement, { onNotice: (notice) => notices.push(notice.message ?? "") });
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNKNOWN";
      const diagnostic = await database.query<{ session_user: string; current_user: string; schema_owner: string; can_use: boolean; can_create: boolean; can_set: boolean; bucket_insert: boolean; bucket_update: boolean; storage_use: boolean }>(`
        SELECT session_user, current_user, n.nspowner::regrole::text AS schema_owner,
               has_schema_privilege(current_user, 'aicp', 'USAGE') AS can_use,
               has_schema_privilege(current_user, 'aicp', 'CREATE') AS can_create,
               pg_has_role(current_user, 'aicp_migrator', 'SET') AS can_set,
               has_table_privilege(current_user, 'storage.buckets', 'INSERT') AS bucket_insert,
               has_table_privilege(current_user, 'storage.buckets', 'UPDATE') AS bucket_update,
               has_schema_privilege(current_user, 'storage', 'USAGE') AS storage_use
        FROM pg_namespace n WHERE n.nspname = 'aicp'
      `).catch(() => ({ rows: [] }));
      throw new Error(`${label} [${statement.slice(0, 140)}]: ${message} ${JSON.stringify(diagnostic.rows[0])}`, { cause: error });
    }
  }
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
      if (index > 0) {
        await database.exec("SET SESSION AUTHORIZATION hosted_postgres");
        const afterMigration = await database.query<{ session_user: string; current_user: string; can_set: boolean }>(
          `SELECT session_user, current_user, pg_has_role('hosted_postgres', 'aicp_migrator', 'SET') AS can_set`,
        );
        assert.deepEqual(afterMigration.rows[0], { session_user: "hosted_postgres", current_user: "hosted_postgres", can_set: false },
          `${migrationNames[index]} must revoke temporary SET access`);
        await assert.rejects(database.exec("SET ROLE aicp_migrator"), /permission denied to set role/i);
        await database.exec("RESET SESSION AUTHORIZATION");
      }
    }
    assert.equal(notices.some((notice) => /no privileges were granted/i.test(notice)), false, notices.join("\n"));

    const actorRole = await database.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>(
      "SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'aicp_migrator'",
    );
    assert.deepEqual(actorRole.rows[0], { rolsuper: false, rolbypassrls: false, rolcanlogin: false });
    const schemaOwner = await database.query<{ owner: string }>(
      "SELECT r.rolname AS owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname='aicp'",
    );
    assert.deepEqual(schemaOwner.rows, [{ owner: "aicp_migrator" }]);
    const relationOwners = await database.query<{ owner: string }>(`
      SELECT DISTINCT r.rolname AS owner
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='aicp' AND c.relkind IN ('r','p','i','S') ORDER BY owner
    `);
    assert.deepEqual(relationOwners.rows, [{ owner: "aicp_migrator" }]);
    const productFunctionOwners = await database.query<{ owner: string }>(`
      SELECT DISTINCT r.rolname AS owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='aicp' AND p.proname <> 'current_auth_uid' ORDER BY owner
    `);
    assert.deepEqual(productFunctionOwners.rows, [{ owner: "aicp_migrator" }]);

    const migrationRolePrivileges = await database.query<{ membership: boolean; can_set: boolean; membership_rows: number; grants: string }>(
      `SELECT pg_has_role('hosted_postgres', 'aicp_migrator', 'MEMBER') AS membership,
              pg_has_role('hosted_postgres', 'aicp_migrator', 'SET') AS can_set,
              (SELECT count(*)::int FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid
               JOIN pg_roles member ON member.oid = m.member WHERE r.rolname='aicp_migrator' AND member.rolname='hosted_postgres') AS membership_rows,
              (SELECT string_agg(format('admin=%s,inherit=%s,set=%s,grantor=%s', m.admin_option, m.inherit_option, m.set_option, grantor.rolname), ';')
               FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid JOIN pg_roles member ON member.oid = m.member
               JOIN pg_roles grantor ON grantor.oid = m.grantor WHERE r.rolname='aicp_migrator' AND member.rolname='hosted_postgres') AS grants`,
    );
    assert.deepEqual(migrationRolePrivileges.rows[0], {
      membership: true, can_set: false, membership_rows: 2,
      grants: "admin=t,inherit=f,set=f,grantor=postgres;admin=f,inherit=f,set=f,grantor=hosted_postgres",
    }, "the creator retains ADMIN OPTION, but the migration must remove SET after each file");
    await database.exec("SET SESSION AUTHORIZATION hosted_postgres");
    await assert.rejects(database.exec("SET ROLE aicp_migrator"), /permission denied to set role/i);
    await database.exec("RESET SESSION AUTHORIZATION");

    await runAsHosted(database, `
      INSERT INTO aicp.workspaces (workspace_id, name, status)
      VALUES ('synthetic-shop', 'Synthetic shop', 'active')
      ON CONFLICT (workspace_id) DO UPDATE SET name = EXCLUDED.name, status = 'active';
      INSERT INTO aicp.workspace_memberships (workspace_id, user_id, role, status)
      VALUES ('synthetic-shop', '${OWNER}', 'owner', 'active')
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
      INSERT INTO aicp.workspace_connections (workspace_id, connection_id, channel, status)
      VALUES ('synthetic-shop', 'synthetic-web', 'web', 'active')
      ON CONFLICT (workspace_id, connection_id) DO UPDATE SET channel = 'web', status = 'active';
    `, "seed writes", notices);
    await runAsHosted(database, "ALTER ROLE knowledge_runtime LOGIN PASSWORD 'synthetic-test-password'", "runtime role password provisioning", notices);
    const runtimeRole = await database.query<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>(
      "SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'knowledge_runtime'",
    );
    assert.deepEqual(runtimeRole.rows[0], { rolsuper: false, rolbypassrls: false, rolcanlogin: true });

    const seedPrivileges = await database.query<{ runner_workspace_insert: boolean; runner_membership_update: boolean; runner_connection_update: boolean; runner_knowledge_insert: boolean }>(`
      SELECT has_table_privilege('hosted_postgres', 'aicp.workspaces', 'INSERT') AS runner_workspace_insert,
             has_table_privilege('hosted_postgres', 'aicp.workspace_memberships', 'UPDATE') AS runner_membership_update,
             has_table_privilege('hosted_postgres', 'aicp.workspace_connections', 'UPDATE') AS runner_connection_update,
             has_table_privilege('hosted_postgres', 'aicp.knowledge_sources', 'INSERT') AS runner_knowledge_insert
    `);
    assert.deepEqual(seedPrivileges.rows[0], {
      runner_workspace_insert: true, runner_membership_update: true,
      runner_connection_update: true, runner_knowledge_insert: false,
    });
    const runtimePrivileges = await database.query<{ runtime_workspace_insert: boolean; runtime_membership_insert: boolean; runtime_connections_update: boolean; authenticated_workspace_insert: boolean; authenticated_membership_insert: boolean; authenticated_connections_update: boolean }>(`
      SELECT has_table_privilege('knowledge_runtime', 'aicp.workspaces', 'INSERT') AS runtime_workspace_insert,
             has_table_privilege('knowledge_runtime', 'aicp.workspace_memberships', 'INSERT') AS runtime_membership_insert,
             has_table_privilege('knowledge_runtime', 'aicp.workspace_connections', 'UPDATE') AS runtime_connections_update,
             has_table_privilege('authenticated', 'aicp.workspaces', 'INSERT') AS authenticated_workspace_insert,
             has_table_privilege('authenticated', 'aicp.workspace_memberships', 'INSERT') AS authenticated_membership_insert,
             has_table_privilege('authenticated', 'aicp.workspace_connections', 'UPDATE') AS authenticated_connections_update
    `);
    assert.deepEqual(runtimePrivileges.rows[0], {
      runtime_workspace_insert: false, runtime_membership_insert: false, runtime_connections_update: false,
      authenticated_workspace_insert: false, authenticated_membership_insert: false, authenticated_connections_update: false,
    });
    await database.exec("SET SESSION AUTHORIZATION postgres");
    const privateBucket = await database.query<{ public: boolean; file_size_limit: string }>(
      "SELECT public, file_size_limit::text FROM storage.buckets WHERE id = 'knowledge-originals'",
    );
    assert.deepEqual(privateBucket.rows[0], { public: false, file_size_limit: "5242880" });
    await database.exec("RESET SESSION AUTHORIZATION");

    await database.exec("SET SESSION AUTHORIZATION postgres");
    await database.exec(`
      INSERT INTO aicp.workspaces (workspace_id, name, status)
      VALUES ('shop-a', 'Synthetic A', 'active'), ('shop-b', 'Synthetic B', 'active');
      INSERT INTO aicp.workspace_memberships (workspace_id, user_id, role, status)
      VALUES ('shop-a', '${OWNER}', 'owner', 'active');
      INSERT INTO aicp.knowledge_sources (workspace_id, source_id, kind, title, created_at)
      VALUES ('shop-a', 'source-a', 'faq', 'Synthetic FAQ', now());
      INSERT INTO aicp.knowledge_versions (workspace_id, source_id, version_id, kind, title, content, status, created_at)
      VALUES ('shop-a', 'source-a', 'version-a', 'faq', 'Synthetic FAQ', 'Synthetic evidence', 'indexed', now());
      INSERT INTO aicp.knowledge_chunks
        (workspace_id, source_id, version_id, chunk_id, chunk_index, text, locator_kind,
         locator_chunk_index, locator_position, start_offset, end_offset)
      VALUES ('shop-a', 'source-a', 'version-a', 'chunk-a', 0, 'Synthetic evidence', 'chunk', 0, NULL, 0, 18);
    `);
    await database.exec("RESET SESSION AUTHORIZATION");
    await database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [OUTSIDER]);
      await assert.rejects(transaction.query("SELECT aicp.approve_knowledge_version('shop-a', 'source-a', 'version-a')"),
        (error: unknown) => (error as { message?: string }).message?.includes("MEMBERSHIP_REQUIRED"));
    });
    await database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [OWNER]);
      await transaction.query("SELECT aicp.approve_knowledge_version('shop-a', 'source-a', 'version-a')");
    });
    const approved = await database.query<{ status: string; approved_by: string }>(
      "SELECT status, approved_by FROM aicp.knowledge_versions WHERE workspace_id = 'shop-a' AND version_id = 'version-a'",
    );
    assert.deepEqual(approved.rows[0], { status: "approved", approved_by: OWNER });
    await database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE authenticated");
      await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [OWNER]);
      const otherWorkspace = await transaction.query("SELECT workspace_id FROM aicp.workspaces WHERE workspace_id = 'shop-b'");
      assert.deepEqual(otherWorkspace.rows, [], "authenticated RLS must hide another workspace");
    });
    await assert.rejects(database.transaction(async (transaction) => {
      await transaction.exec("SET LOCAL ROLE knowledge_runtime");
      await transaction.query("SELECT set_config('app.workspace_id', 'shop-a', true)");
      await transaction.query(`
        INSERT INTO aicp.knowledge_sources (workspace_id, source_id, kind, title, created_at)
        VALUES ('shop-b', 'cross-tenant', 'faq', 'Cross tenant', now())
      `);
    }), (error: unknown) => (error as { code?: string }).code === "42501");

    const authHelper = await database.query<{ owner: string; security_definer: boolean; config: string[]; migrator_exec: boolean; runtime_exec: boolean; authenticated_exec: boolean }>(`
      SELECT r.rolname AS owner, p.prosecdef AS security_definer, p.proconfig AS config,
             has_function_privilege('aicp_migrator', p.oid, 'EXECUTE') AS migrator_exec,
             has_function_privilege('knowledge_runtime', p.oid, 'EXECUTE') AS runtime_exec,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='aicp' AND p.proname='current_auth_uid'
    `);
    assert.deepEqual(authHelper.rows[0], {
      owner: "hosted_postgres", security_definer: true, config: ["search_path=pg_catalog"],
      migrator_exec: true, runtime_exec: false, authenticated_exec: false,
    });
  } finally {
    await database.close();
  }
});

test("migrations fail clearly when an existing product role has unsafe attributes", async () => {
  for (const unsafeRole of ["aicp_migrator", "knowledge_runtime"] as const) {
    const database = new PGlite();
    try {
      await bootstrapHosted(database, unsafeRole);
      const base = await readFile(migrationPaths[0]!, "utf8");
      const host = await readFile(migrationPaths[1]!, "utf8");
      await runAsHosted(database, base, migrationNames[0]!, []);
      await assert.rejects(runAsHosted(database, host, migrationNames[1]!, []),
        new RegExp(`${unsafeRole === "aicp_migrator" ? "AICP_MIGRATOR" : "KNOWLEDGE_RUNTIME"}_ROLE_UNSAFE`));
    } finally {
      await database.close();
    }
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
