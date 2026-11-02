import assert from "node:assert/strict";
import test from "node:test";
import { seedEnvironment } from "./seed-environment.mjs";

const ref = "abcdefghijklmnopqrst";
const common = {
  SUPABASE_SECRET_KEY: "synthetic",
  KNOWLEDGE_RUNTIME_PASSWORD: "a".repeat(64),
  LOCAL_OWNER_EMAIL: "owner@example.test",
  LOCAL_OWNER_PASSWORD: "synthetic-password-over-20",
};
const local = {
  ...common,
  APP_ENV: "local",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_DB_ADMIN_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
};
const lab = {
  ...common,
  APP_ENV: "lab",
  NEXT_PUBLIC_APP_ENV: "lab",
  NEXT_PUBLIC_SUPABASE_PROJECT_REF: ref,
  SUPABASE_PROJECT_REF: ref,
  LAB_SEED_CONFIRM_PROJECT_REF: ref,
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_DB_ADMIN_URL: `postgresql://postgres.${ref}:synthetic@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  SUPABASE_DB_CA_CERT: "-----BEGIN CERTIFICATE-----\nsynthetic\n-----END CERTIFICATE-----",
};

test("local seed target stays loopback only and uses no TLS option", () => {
  assert.equal(seedEnvironment(local).ssl, undefined);
  assert.throws(() => seedEnvironment({ ...local, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co` }),
    /NEXT_PUBLIC_SUPABASE_URL_MUST_TARGET_LOCAL_SUPABASE/);
  assert.throws(() => seedEnvironment({ ...local, SUPABASE_DB_ADMIN_URL: lab.SUPABASE_DB_ADMIN_URL }),
    /SUPABASE_DB_ADMIN_URL_MUST_TARGET_LOCAL_SUPABASE/);
});

test("lab seed target needs the confirmed project, verified TLS and a synthetic owner", () => {
  const accepted = seedEnvironment(lab);
  assert.equal(accepted.ssl.rejectUnauthorized, true);
  assert.equal(accepted.ssl.ca, lab.SUPABASE_DB_CA_CERT);
  for (const [override, code] of [
    [{ LAB_SEED_CONFIRM_PROJECT_REF: undefined }, /LAB_SEED_CONFIRM_PROJECT_REF_MISMATCH/],
    [{ LAB_SEED_CONFIRM_PROJECT_REF: "uvwxyzabcdefghijklmn" }, /LAB_SEED_CONFIRM_PROJECT_REF_MISMATCH/],
    [{ NEXT_PUBLIC_APP_ENV: "local" }, /LAB_APP_ENV_MISMATCH/],
    [{ SUPABASE_PROJECT_REF: "uvwxyzabcdefghijklmn" }, /LAB_SUPABASE_PROJECT_REF_REQUIRED/],
    [{ NEXT_PUBLIC_SUPABASE_URL: "https://uvwxyzabcdefghijklmn.supabase.co" }, /LAB_SUPABASE_URL_REQUIRED/],
    [{ SUPABASE_DB_ADMIN_URL: `postgresql://postgres.${ref}:pw@evil.pooler.supabase.com:5432/postgres` }, /LAB_DB_ADMIN_URL_REQUIRED/],
    [{ SUPABASE_DB_ADMIN_URL: `postgresql://postgres.uvwxyzabcdefghijklmn:pw@aws-0-x.pooler.supabase.com:5432/postgres` }, /LAB_DB_ADMIN_URL_REQUIRED/],
    [{ LOCAL_OWNER_EMAIL: "owner@wstera.com" }, /LAB_SEED_OWNER_MUST_BE_SYNTHETIC/],
    [{ SUPABASE_DB_CA_CERT: "not a certificate" }, /LAB_DATABASE_CA_CERT_REQUIRED/],
  ]) assert.throws(() => seedEnvironment({ ...lab, ...override }), code);
});

test("any other app environment is refused", () => {
  assert.throws(() => seedEnvironment({ ...lab, APP_ENV: "production" }), /SEED_REQUIRES_APP_ENV_LOCAL_OR_LAB/);
  assert.throws(() => seedEnvironment({ ...lab, APP_ENV: undefined }), /SEED_REQUIRES_APP_ENV_LOCAL_OR_LAB/);
});
