-- ===========================================================================================
-- DRAFT.  NEVER RUN ON A SHARED PROJECT.  NOT RUN.  NEVER TRIED.  UNREVIEWED.
-- ===========================================================================================
-- This is the manual rollback for the AICP migrations and seed (supabase/migrations/*.sql,
-- scripts/seed-local.mjs), drafted from plans/HANDOFF-2026-11-03.md section 4 (draft PR #27).
-- The rollback has NEVER been tried on any database. Treat every statement as unproven.
-- There is no down migration in this repository. If the target is a disposable project, deleting the whole
-- project from the dashboard is simpler and safer than this file; prefer that.
--
-- Use ONLY when ALL of these hold:
--   1. The Owner's GO names this exact disposable test project (not wstera-lab, not any shared project).
--   2. scripts/e2e-preflight.sql was run BEFORE the apply and showed no STOP row (so roles, bucket and
--      schema aicp were all created by us, not pre-existing). If it showed a pre-existing role or bucket,
--      DO NOT USE THIS FILE: it would delete something that was never ours.
--   3. You will uncomment each statement deliberately, one at a time, and read its output first.
--
-- Every destructive statement below is commented out. Sections 1-4 are also behind a guard that raises
-- unless the session is acknowledged:
--     SET e2e.rollback_ack = 'DISPOSABLE-TEST-PROJECT-ONLY';
-- (run it in the same psql session before the uncommented statement; it is per session, not stored).
--
-- Order matters: storage -> synthetic user -> schema -> roles -> dashboard Data API entry.
-- Run with:  psql "<admin connection string>" -X -v ON_ERROR_STOP=1   (interactive, paste step by step)
-- ===========================================================================================

-- Section 0: read-only look at what exists now (safe).
SELECT 'bucket' AS what, id::text AS name, public::text AS detail FROM storage.buckets WHERE id = 'knowledge-originals'
UNION ALL SELECT 'bucket objects', count(*)::text, '' FROM storage.objects WHERE bucket_id = 'knowledge-originals'
UNION ALL SELECT 'aicp tables', string_agg(c.relname, ', ' ORDER BY c.relname), count(*)::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'aicp' AND c.relkind = 'r'
UNION ALL SELECT 'roles', string_agg(rolname, ', '), '' FROM pg_roles WHERE rolname IN ('aicp_migrator', 'knowledge_runtime')
UNION ALL SELECT 'synthetic users', string_agg(email, ', '), count(*)::text FROM auth.users WHERE email ILIKE '%@example.test';

-- Section 1: Storage originals, then the bucket.
-- UNVERIFIED: Supabase may reject direct DELETE on storage.objects / storage.buckets from SQL
-- (a protection trigger is believed to exist). If it errors, remove the objects and the bucket with the
-- dashboard Storage page or the Storage API instead, and skip these two statements.
-- DO $$ BEGIN
--   IF current_setting('e2e.rollback_ack', true) IS DISTINCT FROM 'DISPOSABLE-TEST-PROJECT-ONLY' THEN
--     RAISE EXCEPTION 'rollback not acknowledged'; END IF;
-- END $$;
-- DELETE FROM storage.objects WHERE bucket_id = 'knowledge-originals';
-- DELETE FROM storage.buckets WHERE id = 'knowledge-originals';

-- Section 2: the synthetic user(s). Only @example.test addresses are ever matched.
-- Cascades to aicp.workspace_memberships (migration 2, line 11 ON DELETE CASCADE).
-- Alternative: delete the user from the dashboard Authentication page.
-- DO $$ DECLARE n int; BEGIN
--   IF current_setting('e2e.rollback_ack', true) IS DISTINCT FROM 'DISPOSABLE-TEST-PROJECT-ONLY' THEN
--     RAISE EXCEPTION 'rollback not acknowledged'; END IF;
--   SELECT count(*) INTO n FROM auth.users WHERE email ILIKE '%@example.test';
--   IF n > 3 THEN RAISE EXCEPTION 'more than 3 synthetic users (%), looks wrong; stop', n; END IF;
-- END $$;
-- DELETE FROM auth.users WHERE email ILIKE '%@example.test';   -- repeat deliberately for each synthetic user you created

-- Section 3: drop schema aicp. The guard refuses unless aicp holds exactly our 8 tables.
-- This deletes every product row. It also removes the grants we gave `authenticated` on this schema.
-- DO $$ DECLARE found text[]; BEGIN
--   IF current_setting('e2e.rollback_ack', true) IS DISTINCT FROM 'DISPOSABLE-TEST-PROJECT-ONLY' THEN
--     RAISE EXCEPTION 'rollback not acknowledged'; END IF;
--   SELECT array_agg(c.relname::text ORDER BY c.relname) INTO found
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'aicp' AND c.relkind = 'r';
--   IF found IS DISTINCT FROM ARRAY['knowledge_chunks','knowledge_original_objects','knowledge_quarantine_records',
--        'knowledge_sources','knowledge_versions','workspace_connections','workspace_memberships','workspaces'] THEN
--     RAISE EXCEPTION 'aicp does not contain exactly our 8 tables (%); stop', found; END IF;
-- END $$;
-- DROP SCHEMA aicp CASCADE;

-- Section 4: roles. Only after section 3, and only if the preflight showed neither role pre-existed.
-- The guard refuses while any object anywhere in the cluster still depends on the role.
-- REASSIGN OWNED / DROP OWNED also removes the role's grants (including GRANT USAGE ON SCHEMA auth TO aicp_migrator).
-- DO $$ DECLARE r text; n bigint; BEGIN
--   IF current_setting('e2e.rollback_ack', true) IS DISTINCT FROM 'DISPOSABLE-TEST-PROJECT-ONLY' THEN
--     RAISE EXCEPTION 'rollback not acknowledged'; END IF;
--   FOREACH r IN ARRAY ARRAY['knowledge_runtime', 'aicp_migrator'] LOOP
--     CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
--     EXECUTE format('REASSIGN OWNED BY %I TO %I', r, current_user);
--     EXECUTE format('DROP OWNED BY %I', r);
--     SELECT count(*) INTO n FROM pg_shdepend d JOIN pg_roles ro ON ro.oid = d.refobjid
--       WHERE ro.rolname = r AND d.deptype = 'o';
--     IF n > 0 THEN RAISE EXCEPTION 'role % still owns % object(s); stop', r, n; END IF;
--     EXECUTE format('DROP ROLE %I', r);
--   END LOOP;
-- END $$;
-- Caveat: REASSIGN OWNED hands any remaining owned object to the current user; if the preflight showed
-- the roles pre-existed, DO NOT run this section at all.

-- Section 5: refresh the Data API cache (harmless, optional; UNVERIFIED that it is needed).
-- NOTIFY pgrst, 'reload schema';

-- Section 6: verification (read-only, safe): re-run scripts/e2e-preflight.sql and keep the raw output.

-- ===========================================================================================
-- MANUAL, outside SQL (Owner or authorised operator, dashboard):
--   * Data API settings: REMOVE `aicp` from the exposed schemas list. Keep every other entry exactly as it was.
--     Never replace the whole list. Do this on a shared project only if you added it; on a disposable
--     project it vanishes with the project.
--   * Delete .env.local values you created (project ref, DATABASE_URL, secret key, CA cert) from the machine.
--   * Rotate or delete the project's keys if they were ever pasted anywhere outside .env.local.
--   * Preferred overall teardown: delete the whole disposable Supabase test project from the dashboard.
-- ===========================================================================================
