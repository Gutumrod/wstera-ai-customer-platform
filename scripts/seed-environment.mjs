const loopbackHosts = ["127.0.0.1", "localhost", "::1"];

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function assertLocalUrl(name, value, expectedPort) {
  const parsed = new URL(value);
  if (!loopbackHosts.includes(parsed.hostname)
    || parsed.port !== String(expectedPort)) throw new Error(`${name}_MUST_TARGET_LOCAL_SUPABASE`);
}

function assertLab(env, supabaseUrl, adminUrl, email) {
  const ref = required(env, "NEXT_PUBLIC_SUPABASE_PROJECT_REF");
  if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error("LAB_SUPABASE_PROJECT_REF_REQUIRED");
  if (env.NEXT_PUBLIC_APP_ENV !== "lab") throw new Error("LAB_APP_ENV_MISMATCH");
  if (env.SUPABASE_PROJECT_REF !== ref) throw new Error("LAB_SUPABASE_PROJECT_REF_REQUIRED");
  if (env.LAB_SEED_CONFIRM_PROJECT_REF !== ref) throw new Error("LAB_SEED_CONFIRM_PROJECT_REF_MISMATCH");
  if (supabaseUrl !== `https://${ref}.supabase.co`) throw new Error("LAB_SUPABASE_URL_REQUIRED");
  const admin = new URL(adminUrl);
  if (!/^postgres(?:ql)?:$/.test(admin.protocol) || !/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(admin.hostname)
    || !["5432", "6543"].includes(admin.port) || admin.pathname !== "/postgres" || admin.search !== "" || admin.hash !== ""
    || decodeURIComponent(admin.username) !== `postgres.${ref}`) throw new Error("LAB_DB_ADMIN_URL_REQUIRED");
  if (!/@example\.test$/i.test(email)) throw new Error("LAB_SEED_OWNER_MUST_BE_SYNTHETIC");
  const ca = required(env, "SUPABASE_DB_CA_CERT");
  if (!ca.includes("BEGIN CERTIFICATE")) throw new Error("LAB_DATABASE_CA_CERT_REQUIRED");
  return { ca, rejectUnauthorized: true };
}

/** Validates the seed target before anything is written. Pure so it can be tested without a database. */
export function seedEnvironment(env) {
  const appEnv = env.APP_ENV;
  if (appEnv !== "local" && appEnv !== "lab") throw new Error("SEED_REQUIRES_APP_ENV_LOCAL_OR_LAB");
  const supabaseUrl = required(env, "NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = required(env, "SUPABASE_SECRET_KEY");
  const adminUrl = required(env, "SUPABASE_DB_ADMIN_URL");
  const runtimePassword = required(env, "KNOWLEDGE_RUNTIME_PASSWORD");
  if (!/^[a-f0-9]{64}$/u.test(runtimePassword)) throw new Error("KNOWLEDGE_RUNTIME_PASSWORD_MUST_BE_64_HEX_CHARS");
  const email = required(env, "LOCAL_OWNER_EMAIL");
  const password = required(env, "LOCAL_OWNER_PASSWORD");
  if (password.length < 20) throw new Error("LOCAL_OWNER_PASSWORD_TOO_SHORT");
  let ssl;
  if (appEnv === "lab") ssl = assertLab(env, supabaseUrl, adminUrl, email);
  else {
    assertLocalUrl("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl, 54321);
    assertLocalUrl("SUPABASE_DB_ADMIN_URL", adminUrl, 54322);
  }
  return { appEnv, supabaseUrl, secretKey, adminUrl, runtimePassword, email, password, ssl };
}
