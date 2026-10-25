# TASK AICP-HOST-003 — Report

## Result

Completed the requested schema isolation and local configuration changes on branch `codex/aicp-schema-isolation-20261025`, based on `9b4f997`. No hosted database was queried or modified. No credentials or secret values were added.

## Files changed

- `supabase/migrations/20261022000100_knowledge.sql` — creates `aicp`; qualifies the knowledge tables, references, functions, trigger targets, policies, and index table targets.
- `supabase/migrations/20261023000100_g1_workspace_host.sql` — moves workspace, membership, connection, quarantine, and original-reference objects to `aicp`; adds idempotent restricted `aicp_migrator`, transfers schema ownership, preserves the `knowledge_runtime` grants pattern, and fixes the SECURITY DEFINER search path.
- `platform/adapters/persistence/postgres/migrations/001-knowledge.sql` — kept byte-identical to the tested knowledge migration.
- `platform/adapters/persistence/postgres/knowledge-repository.ts` and `knowledge-intake-audit.ts` — use explicit `aicp.` relation names.
- `platform/adapters/persistence/supabase/workspace-membership-repository.ts` — selects schema `aicp` explicitly.
- `platform/composition/merchant-knowledge-host.ts` and new `knowledge-database-url.ts` — use the extracted URL policy.
- `platform/adapters/persistence/postgres/knowledge-repository.test.ts` and `platform/adapters/persistence/supabase/workspace-host-migration.test.ts` — target `aicp`; retain the prior lifecycle, RLS, grants, storage, tenant isolation, and canonical locator assertions. Added migrator-role/schema-owner checks.
- New `platform/composition/knowledge-database-url.test.ts` — covers local guard compatibility and accepted/rejected LAB URL cases.
- `package.json` — includes the workspace migration and URL policy tests in `npm test` / `npm run check`.
- `REPORT-HOST-003-npm-ci-output.txt` and `REPORT-HOST-003-check-output.txt` — raw outputs from the final required verification sequence.

## Verification

- `npm ci` — exit 0; added 59 packages, audited 60, 0 vulnerabilities.
- `npm run check` — exit 0. Typecheck passed; **176 tests passed, 0 failed, 0 skipped**; TypeScript and Next.js production builds passed.
- `git diff --check` — exit 0.
- `rg -n 'public\.' supabase/migrations` — no matches. There are no remaining schema-qualified `public.` references in the migrations, so there are none to justify individually. `storage.buckets.public` remains unchanged as a storage column, and SQL `PUBLIC` role references are not references to the `public` schema.
- PGlite migration/repository tests ran against local in-memory databases only. No hosted query, migration, seed, provider call, or external write was performed.

## URL policy

- Local: unchanged policy; only `127.0.0.1`, `localhost`, or `[::1]`, port `54322`, and user `knowledge_runtime` are accepted. Existing local error codes remain unchanged.
- LAB (`APP_ENV=lab`): accepts only `*.pooler.supabase.com`, port `5432` or `6543`, database `/postgres`, and user `knowledge_runtime.<ref>` or `postgres.<ref>`. Other hosts/configurations fail closed.

## Remaining limitation

The requested database URL validator accepts LAB URLs. The wider host composition also initializes the Supabase private-storage admin client, whose existing configuration guard still requires `APP_ENV=local`. This task did not expand that separate Supabase Storage configuration boundary or use hosted credentials, so a full LAB host startup remains unverified and needs its own scoped decision/configuration work.

DONE
