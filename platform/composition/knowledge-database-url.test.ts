import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { requiredKnowledgeDatabaseUrl } from "./knowledge-database-url.js";

test("knowledge database URL policy preserves local guard and accepts only Supabase LAB pooler URLs", async (t) => {
  const previousProjectRef = process.env.SUPABASE_PROJECT_REF;
  delete process.env.SUPABASE_PROJECT_REF;

  assert.equal(requiredKnowledgeDatabaseUrl("local", "postgresql://knowledge_runtime:local@127.0.0.1:54322/postgres"),
    "postgresql://knowledge_runtime:local@127.0.0.1:54322/postgres");
  assert.throws(() => requiredKnowledgeDatabaseUrl("local", "postgresql://knowledge_runtime:local@db.example.com:54322/postgres"),
    /LOCAL_KNOWLEDGE_DATABASE_URL_REQUIRED/);
  assert.throws(() => requiredKnowledgeDatabaseUrl("local", undefined), /LOCAL_DATABASE_URL_REQUIRED/);
  assert.throws(() => requiredKnowledgeDatabaseUrl("local", "not a URL"), TypeError);

  for (const port of [5432, 6543]) {
    for (const user of ["knowledge_runtime.abcdefghijklmnopqrst", "postgres.abcdefghijklmnopqrst"]) {
      const url = `postgresql://${user}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:${port}/postgres`;
      assert.equal(requiredKnowledgeDatabaseUrl("lab", url), url);
    }
  }
  for (const url of [
    "postgresql://knowledge_runtime.project-ref:synthetic@db.project-ref.supabase.co:5432/postgres",
    "postgresql://knowledge_runtime.project-ref:synthetic@aws-0.pooler.supabase.com:5433/postgres",
    "postgresql://knowledge_runtime.project-ref:synthetic@aws-0.pooler.supabase.com:5432/other",
    "postgresql://knowledge_runtime:synthetic@aws-0.pooler.supabase.com:5432/postgres",
    "postgresql://knowledge_runtime.abcdefghijklmnopqrs:synthetic@aws-0.pooler.supabase.com:5432/postgres",
    "postgresql://knowledge_runtime.abcdefghijklmnopqr-st:synthetic@aws-0.pooler.supabase.com:5432/postgres",
    "postgresql://knowledge_runtime.abcdefghijklmnopqrst@aws-0.pooler.supabase.com:5432/postgres",
    "postgresql://attacker.project-ref:synthetic@aws-0.pooler.supabase.com:5432/postgres",
    "postgresql://knowledge_runtime.project-ref:synthetic@evilpooler.supabase.com:5432/postgres",
    "postgresql://knowledge_runtime.abcdefghijklmnopqrst:pw@evilstuff.pooler.supabase.com:5432/postgres?sslmode=disable",
    "postgresql://knowledge_runtime.abcdefghijklmnopqrst:pw@aws-0.pooler.supabase.com:5432/postgres#disable-tls",
  ]) assert.throws(() => requiredKnowledgeDatabaseUrl("lab", url), /LAB_KNOWLEDGE_DATABASE_URL_REQUIRED/);

  process.env.SUPABASE_PROJECT_REF = "abcdefghijklmnopqrst";
  try {
    const matchingRefUrl = "postgresql://knowledge_runtime.abcdefghijklmnopqrst:synthetic@aws-0.pooler.supabase.com:5432/postgres";
    assert.equal(requiredKnowledgeDatabaseUrl("lab", matchingRefUrl), matchingRefUrl);
    assert.throws(() => requiredKnowledgeDatabaseUrl("lab",
      "postgresql://knowledge_runtime.uvwxyzabcdefghijklmn:synthetic@aws-0.pooler.supabase.com:5432/postgres"),
    /LAB_KNOWLEDGE_DATABASE_URL_REQUIRED/);
  } finally {
    if (previousProjectRef === undefined) delete process.env.SUPABASE_PROJECT_REF;
    else process.env.SUPABASE_PROJECT_REF = previousProjectRef;
  }

  register("data:text/javascript,export async function resolve(specifier, context, nextResolve) { if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }; return nextResolve(specifier, context); }", import.meta.url);
  const { createSupabaseAdminClient } = await import("../apps/merchant-console/lib/supabase/admin.js");
  const previous = {
    appEnv: process.env.APP_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: process.env.SUPABASE_SECRET_KEY,
  };
  process.env.APP_ENV = "lab";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SECRET_KEY = "synthetic";
  try {
    // LAB host startup is blocked on HOST-004 storage configuration; pin fail-closed behavior until that task lands.
    await t.test("lab admin client remains blocked pending HOST-004 storage configuration", () => {
      assert.throws(() => createSupabaseAdminClient(), { message: "LOCAL_SUPABASE_SERVER_SECRET_REQUIRED" });
    });
  } finally {
    if (previous.appEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous.appEnv;
    if (previous.supabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.supabaseUrl;
    if (previous.secretKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previous.secretKey;
  }
});
