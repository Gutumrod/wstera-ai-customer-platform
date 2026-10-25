import assert from "node:assert/strict";
import test from "node:test";
import { requiredKnowledgeDatabaseUrl } from "./knowledge-database-url.js";

test("knowledge database URL policy preserves local guard and accepts only Supabase LAB pooler URLs", () => {
  assert.equal(requiredKnowledgeDatabaseUrl("local", "postgresql://knowledge_runtime:local@127.0.0.1:54322/postgres"),
    "postgresql://knowledge_runtime:local@127.0.0.1:54322/postgres");
  assert.throws(() => requiredKnowledgeDatabaseUrl("local", "postgresql://knowledge_runtime:local@db.example.com:54322/postgres"),
    /LOCAL_KNOWLEDGE_DATABASE_URL_REQUIRED/);
  assert.throws(() => requiredKnowledgeDatabaseUrl("local", undefined), /LOCAL_DATABASE_URL_REQUIRED/);

  for (const port of [5432, 6543]) {
    for (const user of ["knowledge_runtime.project-ref", "postgres.project-ref"]) {
      const url = `postgresql://${user}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:${port}/postgres`;
      assert.equal(requiredKnowledgeDatabaseUrl("lab", url), url);
    }
  }
  for (const url of [
    "postgresql://knowledge_runtime.project-ref:synthetic@db.project-ref.supabase.co:5432/postgres",
    "postgresql://knowledge_runtime.project-ref:synthetic@aws-0.pooler.supabase.com:5433/postgres",
    "postgresql://knowledge_runtime.project-ref:synthetic@aws-0.pooler.supabase.com:5432/other",
    "postgresql://knowledge_runtime:synthetic@aws-0.pooler.supabase.com:5432/postgres",
    "postgresql://attacker.project-ref:synthetic@aws-0.pooler.supabase.com:5432/postgres",
    "postgresql://knowledge_runtime.project-ref:synthetic@evilpooler.supabase.com:5432/postgres",
  ]) assert.throws(() => requiredKnowledgeDatabaseUrl("lab", url), /LAB_KNOWLEDGE_DATABASE_URL_REQUIRED/);
});
