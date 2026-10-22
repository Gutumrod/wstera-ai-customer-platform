import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import pg from "pg";

const { Client } = pg;
loadEnvConfig(process.cwd());

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function assertLocalUrl(name, value, expectedPort) {
  const parsed = new URL(value);
  if (!(["127.0.0.1", "localhost", "::1"].includes(parsed.hostname))
    || parsed.port !== String(expectedPort)) throw new Error(`${name}_MUST_TARGET_LOCAL_SUPABASE`);
  return parsed;
}

async function main() {
  if (process.env.APP_ENV !== "local") throw new Error("LOCAL_SEED_REQUIRES_APP_ENV_LOCAL");
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  assertLocalUrl("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl, 54321);
  const secretKey = required("SUPABASE_SECRET_KEY");
  const adminUrl = required("SUPABASE_DB_ADMIN_URL");
  assertLocalUrl("SUPABASE_DB_ADMIN_URL", adminUrl, 54322);
  const runtimePassword = required("KNOWLEDGE_RUNTIME_PASSWORD");
  if (!/^[a-f0-9]{64}$/u.test(runtimePassword)) throw new Error("KNOWLEDGE_RUNTIME_PASSWORD_MUST_BE_64_HEX_CHARS");
  const email = required("LOCAL_OWNER_EMAIL");
  const password = required("LOCAL_OWNER_PASSWORD");
  if (password.length < 20) throw new Error("LOCAL_OWNER_PASSWORD_TOO_SHORT");

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

  const database = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 5_000 });
  await database.connect();
  try {
    const role = await database.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'knowledge_runtime'");
    if (role.rowCount !== 1 || role.rows[0].rolsuper || role.rows[0].rolbypassrls) {
      throw new Error("KNOWLEDGE_RUNTIME_ROLE_UNSAFE");
    }
    const passwordDdl = await database.query("SELECT format('ALTER ROLE knowledge_runtime LOGIN PASSWORD %L', $1) AS statement", [runtimePassword]);
    await database.query(passwordDdl.rows[0].statement);
    await database.query(`
      INSERT INTO public.workspaces (workspace_id, name, status)
      VALUES ('synthetic-shop', 'Synthetic shop', 'active')
      ON CONFLICT (workspace_id) DO UPDATE SET name = EXCLUDED.name, status = 'active'
    `);
    await database.query(`
      INSERT INTO public.workspace_memberships (workspace_id, user_id, role, status)
      VALUES ('synthetic-shop', $1, 'owner', 'active')
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner', status = 'active'
    `, [user.id]);
    await database.query(`
      INSERT INTO public.workspace_connections (workspace_id, connection_id, channel, status)
      VALUES ('synthetic-shop', 'synthetic-web', 'web', 'active')
      ON CONFLICT (workspace_id, connection_id) DO UPDATE SET channel = 'web', status = 'active'
    `);
  } finally {
    await database.end();
  }
  process.stdout.write("Seeded one local synthetic owner, workspace, and web connection.\n");
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ level: "error", event: "local_seed.failed", code: error instanceof Error ? error.message : "UNKNOWN" })}\n`);
  process.exitCode = 1;
});
