import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { PgPostgresDatabase } from "../adapters/persistence/postgres/pg-database.js";
import { supabaseEnvironmentProblem } from "../apps/merchant-console/lib/supabase/environment.js";
import { knowledgeDatabaseTls, requiredKnowledgeDatabaseUrl } from "./knowledge-database-url.js";

const ref = "abcdefghijklmnopqrst";
const otherRef = "uvwxyzabcdefghijklmn";
const managedKeys = ["SUPABASE_PROJECT_REF", "NEXT_PUBLIC_SUPABASE_PROJECT_REF", "APP_ENV", "NEXT_PUBLIC_APP_ENV",
  "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;

function withEnv(values: Partial<Record<(typeof managedKeys)[number], string>>, run: () => void | Promise<void>) {
  const previous = new Map(managedKeys.map((key) => [key, process.env[key]]));
  for (const key of managedKeys) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  return Promise.resolve().then(run).finally(restore);
}

test("local database URL policy is unchanged", () => {
  assert.equal(requiredKnowledgeDatabaseUrl("local", "postgresql://knowledge_runtime:local@127.0.0.1:54322/postgres"),
    "postgresql://knowledge_runtime:local@127.0.0.1:54322/postgres");
  assert.throws(() => requiredKnowledgeDatabaseUrl("local", "postgresql://knowledge_runtime:local@db.example.com:54322/postgres"),
    /LOCAL_KNOWLEDGE_DATABASE_URL_REQUIRED/);
  assert.throws(() => requiredKnowledgeDatabaseUrl("local", undefined), /LOCAL_DATABASE_URL_REQUIRED/);
  assert.throws(() => requiredKnowledgeDatabaseUrl("local", "not a URL"), TypeError);
  assert.throws(() => requiredKnowledgeDatabaseUrl("production", "postgresql://knowledge_runtime:local@127.0.0.1:54322/postgres"),
    /LOCAL_DATABASE_URL_REQUIRED/);
});

test("lab database URL accepts only knowledge_runtime on the pinned project", () => withEnv({
  SUPABASE_PROJECT_REF: ref,
  NEXT_PUBLIC_SUPABASE_PROJECT_REF: ref,
}, () => {
  for (const port of [5432, 6543]) {
    const url = `postgresql://knowledge_runtime.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:${port}/postgres`;
    assert.equal(requiredKnowledgeDatabaseUrl("lab", url), url);
  }
  for (const url of [
    `postgresql://postgres.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    `postgresql://knowledge_runtime.${otherRef}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    `postgresql://knowledge_runtime.${ref}:synthetic@db.${ref}.supabase.co:5432/postgres`,
    `postgresql://knowledge_runtime.${ref}:synthetic@aws-0.pooler.supabase.com:5432/postgres`,
    `postgresql://knowledge_runtime.${ref}:synthetic@evilstuff.pooler.supabase.com:5432/postgres`,
    `postgresql://knowledge_runtime.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com.evil.test:5432/postgres`,
    `postgresql://knowledge_runtime.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:5433/postgres`,
    `postgresql://knowledge_runtime.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:5432/other`,
    `postgresql://knowledge_runtime.${ref}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
    `postgresql://knowledge_runtime.${ref}:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=disable`,
    `postgresql://knowledge_runtime.${ref}:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres#disable-tls`,
    `http://knowledge_runtime.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  ]) assert.throws(() => requiredKnowledgeDatabaseUrl("lab", url), /LAB_KNOWLEDGE_DATABASE_URL_REQUIRED/);
}));

test("lab database URL fails closed without a matching project ref", async () => {
  const url = `postgresql://knowledge_runtime.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`;
  for (const values of [
    {},
    { SUPABASE_PROJECT_REF: ref },
    { NEXT_PUBLIC_SUPABASE_PROJECT_REF: ref },
    { SUPABASE_PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_PROJECT_REF: otherRef },
    { SUPABASE_PROJECT_REF: "short", NEXT_PUBLIC_SUPABASE_PROJECT_REF: "short" },
  ]) {
    await withEnv(values, () => {
      assert.throws(() => requiredKnowledgeDatabaseUrl("lab", url), /LAB_SUPABASE_PROJECT_REF_REQUIRED/);
    });
  }
  assert.throws(() => requiredKnowledgeDatabaseUrl("lab", undefined), /LAB_DATABASE_URL_REQUIRED/);
});

test("lab database connections verify TLS and local ones stay plain", () => {
  const certificate = "-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----";
  assert.equal(knowledgeDatabaseTls("local", undefined), undefined);
  assert.deepEqual(knowledgeDatabaseTls("lab", certificate), { caCertificate: certificate });
  assert.throws(() => knowledgeDatabaseTls("lab", undefined), /LAB_DATABASE_CA_CERT_REQUIRED/);
  assert.throws(() => knowledgeDatabaseTls("lab", "not a certificate"), /LAB_DATABASE_CA_CERT_REQUIRED/);

  const url = "postgresql://knowledge_runtime:synthetic@127.0.0.1:54322/postgres";
  const poolSsl = (database: PgPostgresDatabase) => (database as unknown as { pool: { options: { ssl?: unknown } } }).pool.options.ssl;
  assert.equal(poolSsl(new PgPostgresDatabase(url)), undefined);
  assert.deepEqual(poolSsl(new PgPostgresDatabase(url, undefined, { caCertificate: certificate })),
    { ca: certificate, rejectUnauthorized: true });
});

test("Supabase environment guard accepts only local loopback and the pinned lab project", () => {
  const input = (overrides: Partial<Parameters<typeof supabaseEnvironmentProblem>[0]>) => ({
    appEnv: "lab", publicAppEnv: "lab", url: `https://${ref}.supabase.co`, projectRef: ref, ...overrides,
  });
  assert.equal(supabaseEnvironmentProblem(input({})), undefined);
  for (const url of [`http://${ref}.supabase.co`, `https://${otherRef}.supabase.co`, `https://${ref}.supabase.co:8443`,
    `https://${ref}.supabase.co/path`, `https://${ref}.supabase.co?x=1`, `https://${ref}.supabase.co.evil.test`, "http://127.0.0.1:54321", "not a URL"]) {
    assert.equal(supabaseEnvironmentProblem(input({ url })), "LAB_SUPABASE_URL_REQUIRED");
  }
  assert.equal(supabaseEnvironmentProblem(input({ projectRef: undefined })), "LAB_SUPABASE_PROJECT_REF_REQUIRED");
  assert.equal(supabaseEnvironmentProblem(input({ projectRef: "short" })), "LAB_SUPABASE_PROJECT_REF_REQUIRED");
  assert.equal(supabaseEnvironmentProblem(input({ publicAppEnv: "local" })), "LAB_APP_ENV_MISMATCH");

  const local = { appEnv: "local", publicAppEnv: undefined, projectRef: undefined };
  for (const url of ["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"]) {
    assert.equal(supabaseEnvironmentProblem({ ...local, url }), undefined);
  }
  for (const url of ["http://127.0.0.1:5432", `https://${ref}.supabase.co`, "not a URL"]) {
    assert.equal(supabaseEnvironmentProblem({ ...local, url }), "LOCAL_SUPABASE_URL_REQUIRED");
  }
  for (const appEnv of [undefined, "production", "LAB", ""]) {
    assert.equal(supabaseEnvironmentProblem({ appEnv, publicAppEnv: appEnv, url: `https://${ref}.supabase.co`, projectRef: ref }),
      "SUPABASE_APP_ENV_UNSUPPORTED");
  }
});

test("admin client starts only on an accepted environment", async () => {
  register("data:text/javascript,export async function resolve(specifier, context, nextResolve) { if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }; return nextResolve(specifier, context); }", import.meta.url);
  const { createSupabaseAdminClient } = await import("../apps/merchant-console/lib/supabase/admin.js");
  const lab = {
    APP_ENV: "lab",
    NEXT_PUBLIC_APP_ENV: "lab",
    NEXT_PUBLIC_SUPABASE_PROJECT_REF: ref,
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    SUPABASE_SECRET_KEY: "synthetic",
  };
  await withEnv(lab, () => {
    assert.ok(createSupabaseAdminClient());
  });
  await withEnv({ ...lab, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }, () => {
    assert.throws(() => createSupabaseAdminClient(), { message: "LAB_SUPABASE_URL_REQUIRED" });
  });
  await withEnv({ ...lab, APP_ENV: "production" }, () => {
    assert.throws(() => createSupabaseAdminClient(), { message: "SUPABASE_APP_ENV_UNSUPPORTED" });
  });
  await withEnv({ APP_ENV: "local", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "synthetic" }, () => {
    assert.ok(createSupabaseAdminClient());
  });
  await withEnv({ APP_ENV: "lab", NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co` }, () => {
    assert.throws(() => createSupabaseAdminClient(), { message: "SUPABASE_SERVER_SECRET_REQUIRED" });
  });
});
