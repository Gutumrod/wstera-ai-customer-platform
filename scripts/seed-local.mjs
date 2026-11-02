import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import pg from "pg";
import { seedEnvironment } from "./seed-environment.mjs";

const { Client } = pg;
loadEnvConfig(process.cwd());

async function main() {
  const { appEnv, supabaseUrl, secretKey, adminUrl, runtimePassword, email, password, ssl } = seedEnvironment(process.env);

  const supabase = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let user;
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (!created.error) user = created.data.user;
  else if (created.error.message.toLocaleLowerCase("en-US").includes("already")) {
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listed.error) throw new Error("LOCAL_AUTH_USER_LOOKUP_FAILED");
    user = listed.data.users.find((candidate) => candidate.email?.toLocaleLowerCase("en-US") === email.toLocaleLowerCase("en-US"));
  } else {
    throw new Error("LOCAL_AUTH_USER_CREATE_FAILED");
  }
  if (!user) throw new Error("LOCAL_AUTH_USER_NOT_FOUND");

  const database = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 5_000, ...(ssl ? { ssl } : {}) });
  await database.connect();
  try {
    const role = await database.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'knowledge_runtime'");
    if (role.rowCount !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
      throw new Error("KNOWLEDGE_RUNTIME_ROLE_UNSAFE");
    }
    const passwordDdl = await database.query("SELECT format('ALTER ROLE knowledge_runtime LOGIN PASSWORD %L', $1) AS statement", [runtimePassword]);
    await database.query(passwordDdl.rows[0].statement);
    await database.query(`
      INSERT INTO aicp.workspaces (workspace_id, name, status)
      VALUES ('synthetic-shop', 'Synthetic shop', 'active')
      ON CONFLICT (workspace_id) DO UPDATE SET name = EXCLUDED.name, status = 'active'
    `);
    await database.query(`
      INSERT INTO aicp.workspace_memberships (workspace_id, user_id, role, status)
      VALUES ('synthetic-shop', $1, 'owner', 'active')
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner', status = 'active'
    `, [user.id]);
    await database.query(`
      INSERT INTO aicp.workspace_connections (workspace_id, connection_id, channel, status)
      VALUES ('synthetic-shop', 'synthetic-web', 'web', 'active')
      ON CONFLICT (workspace_id, connection_id) DO UPDATE SET channel = 'web', status = 'active'
    `);
  } finally {
    await database.end();
  }
  process.stdout.write(`Seeded one ${appEnv} synthetic owner, workspace, and web connection.\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ level: "error", event: "local_seed.failed", code: error instanceof Error ? error.message : "UNKNOWN" })}\n`);
  process.exitCode = 1;
});
