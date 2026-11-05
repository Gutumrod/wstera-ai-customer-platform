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
--   3. You will uncomment each block deliberately, one at a time, and read its output first.
--
-- Every destructive statement below is commented out. In Sections 1-4 the guard and the destructive
-- statement(s) sit INSIDE THE SAME DO block, so un-commenting a block always runs its guard first
-- (there is no standalone DELETE / DROP line to un-comment by itself). Each block raises unless the
-- session is acknowledged:
--     SET e2e.rollback_ack = 'DISPOSABLE-TEST-PROJECT-ONLY';
-- (run it in the same psql session before the uncommented block; it is per session, not stored).
-- The ack is a typed string, NOT proof of which project you are on. Before any block, compare the
-- identity row of Section 0 (current_database, current_user, server version) with the identity rows of
-- the preflight output and with the project named in the Owner GO. Pooled hosted databases are usually
-- all called `postgres`, so the database name alone proves nothing.
--
-- Order matters: storage -> synthetic user -> schema -> roles -> dashboard Data API entry.
-- Run interactively (paste step by step); the connection string comes from the environment only:
--   psql "$SUPABASE_DB_ADMIN_URL" -X -v ON_ERROR_STOP=1
-- (with PGSSLMODE=verify-full and PGSSLROOTCERT set, see the runbook; never put the URL on the command line)
-- ===========================================================================================

-- Section 0: read-only look at what exists now (safe).
SELECT 'identity' AS what, current_database()::text AS name,
       'user=' || current_user || ' version=' || current_setting('server_version') AS detail
UNION ALL SELECT 'bucket', id::text, public::text FROM storage.buckets WHERE id = 'knowledge-originals'
UNION ALL SELECT 'bucket objects', count(*)::text, '' FROM storage.objects WHERE bucket_id = 'knowledge-originals'
UNION ALL SELECT 'aicp relations (all kinds except indexes)', string_agg(c.relname || ':' || c.relkind::text, ', ' ORDER BY c.relname), count(*)::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'aicp' AND c.relkind <> 'i'
UNION ALL SELECT 'aicp functions', string_agg(p.proname, ', ' ORDER BY p.proname), count(*)::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'aicp'
UNION ALL SELECT 'roles', string_agg(rolname, ', '), '' FROM pg_roles WHERE rolname IN ('aicp_migrator', 'knowledge_runtime')
UNION ALL SELECT 'synthetic users', string_agg(email, ', '), count(*)::text FROM auth.users WHERE email ILIKE '%@example.test';

-- Section 1: Storage originals, then the bucket (guard + deletes in ONE block).
-- UNVERIFIED: Supabase may reject direct DELETE on storage.objects / storage.buckets from SQL
-- (a protection trigger is believed to exist). If it errors, remove the objects and the bucket with the
-- dashboard Storage page or the Storage API instead, and skip this block.
-- DO $$ BEGIN
--   IF current_setting('e2e.rollback_ack', true) IS DISTINCT FROM 'DISPOSABLE-TEST-PROJECT-ONLY' THEN
--     RAISE EXCEPTION 'rollback not acknowledged'; END IF;
--   DELETE FROM storage.objects WHERE bucket_id = 'knowledge-originals';
--   DELETE FROM storage.buckets WHERE id = 'knowledge-originals';
-- END $$;

-- Section 2: the synthetic user(s) (guard + delete in ONE block). Only @example.test addresses are ever matched.
-- Cascades to aicp.workspace_memberships (migration 2, line 11 ON DELETE CASCADE).
-- Alternative: delete the user from the dashboard Authentication page.
-- This matches EVERY @example.test user, including ones somebody else created; read Section 0 first.
-- DO $$ DECLARE n int; BEGIN
--   IF current_setting('e2e.rollback_ack', true) IS DISTINCT FROM 'DISPOSABLE-TEST-PROJECT-ONLY' THEN
--     RAISE EXCEPTION 'rollback not acknowledged'; END IF;
--   SELECT count(*) INTO n FROM auth.users WHERE email ILIKE '%@example.test';
--   IF n > 3 THEN RAISE EXCEPTION 'more than 3 synthetic users (%), looks wrong; stop', n; END IF;
--   DELETE FROM auth.users WHERE email ILIKE '%@example.test';
-- END $$;

-- Section 3: drop schema aicp (guard + DROP in ONE block).
-- DANGER: DROP SCHEMA ... CASCADE also drops objects OUTSIDE aicp that depend on aicp objects
-- (a view, rule, policy, trigger or foreign key in public or any other schema that references an aicp
-- table or function). The block therefore refuses when:
--   * aicp holds anything other than exactly our 8 tables and our 9 functions (any view, sequence,
--     partitioned table, foreign table, materialized view or extra function fails the check), or
--   * any object outside aicp depends on an aicp object. Dependents of unknown kind also count as outside
--     (fail closed), so a refusal can be a false alarm: read the listed objects, then decide as a separate step.
-- This deletes every product row. It also removes the grants we gave `authenticated` on this schema.
-- DO $$ DECLARE rels text[]; funcs text[]; outside text; BEGIN
--   IF current_setting('e2e.rollback_ack', true) IS DISTINCT FROM 'DISPOSABLE-TEST-PROJECT-ONLY' THEN
--     RAISE EXCEPTION 'rollback not acknowledged'; END IF;
--   IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'aicp') THEN
--     RAISE EXCEPTION 'schema aicp does not exist; nothing to drop'; END IF;
--   SELECT array_agg(c.relname::text || ':' || c.relkind::text ORDER BY c.relname) INTO rels
--     FROM pg_class c WHERE c.relnamespace = 'aicp'::regnamespace AND c.relkind <> 'i';
--   IF rels IS DISTINCT FROM ARRAY['knowledge_chunks:r','knowledge_original_objects:r','knowledge_quarantine_records:r',
--        'knowledge_sources:r','knowledge_versions:r','workspace_connections:r','workspace_memberships:r','workspaces:r'] THEN
--     RAISE EXCEPTION 'aicp does not contain exactly our 8 tables and nothing else (%); stop', rels; END IF;
--   SELECT array_agg(p.proname::text ORDER BY p.proname) INTO funcs FROM pg_proc p WHERE p.pronamespace = 'aicp'::regnamespace;
--   IF funcs IS DISTINCT FROM ARRAY['approve_knowledge_version','archive_knowledge_source','assert_active_knowledge_writer',
--        'guard_knowledge_chunk_insert','is_active_workspace_member','protect_knowledge_source_identity',
--        'protect_knowledge_version_identity','protect_knowledge_version_visibility','revoke_knowledge_version'] THEN
--     RAISE EXCEPTION 'aicp does not contain exactly our 9 functions (%); stop', funcs; END IF;
--   WITH aicp_objs AS (
--     SELECT 'pg_class'::regclass::oid AS classid, oid FROM pg_class WHERE relnamespace = 'aicp'::regnamespace
--     UNION ALL SELECT 'pg_proc'::regclass::oid, oid FROM pg_proc WHERE pronamespace = 'aicp'::regnamespace
--     UNION ALL SELECT 'pg_type'::regclass::oid, oid FROM pg_type WHERE typnamespace = 'aicp'::regnamespace
--   ), dep AS (
--     SELECT d.classid, d.objid, d.objsubid FROM pg_depend d
--     JOIN aicp_objs a ON a.classid = d.refclassid AND a.oid = d.refobjid
--     WHERE d.deptype IN ('n', 'a')
--   ), dep_ns AS (
--     SELECT dep.*, CASE dep.classid
--       WHEN 'pg_class'::regclass THEN (SELECT relnamespace FROM pg_class WHERE oid = dep.objid)
--       WHEN 'pg_proc'::regclass THEN (SELECT pronamespace FROM pg_proc WHERE oid = dep.objid)
--       WHEN 'pg_type'::regclass THEN (SELECT typnamespace FROM pg_type WHERE oid = dep.objid)
--       WHEN 'pg_trigger'::regclass THEN (SELECT c.relnamespace FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE t.oid = dep.objid)
--       WHEN 'pg_constraint'::regclass THEN (SELECT c.relnamespace FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid WHERE k.oid = dep.objid)
--       WHEN 'pg_rewrite'::regclass THEN (SELECT c.relnamespace FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class WHERE r.oid = dep.objid)
--       WHEN 'pg_policy'::regclass THEN (SELECT c.relnamespace FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE p.oid = dep.objid)
--       WHEN 'pg_attrdef'::regclass THEN (SELECT c.relnamespace FROM pg_attrdef a JOIN pg_class c ON c.oid = a.adrelid WHERE a.oid = dep.objid)
--     END AS nsp FROM dep
--   )
--   SELECT string_agg(DISTINCT pg_describe_object(classid, objid, objsubid), '; ') INTO outside
--     FROM dep_ns WHERE nsp IS DISTINCT FROM 'aicp'::regnamespace;
--   IF outside IS NOT NULL THEN
--     RAISE EXCEPTION 'objects outside aicp depend on aicp (CASCADE would drop them): %; stop', outside; END IF;
--   DROP SCHEMA aicp CASCADE;
-- END $$;

-- Section 4: roles (guard + REVOKE/DROP in ONE block). Only after section 3, and only if the preflight
-- showed neither role pre-existed. There is deliberately NO REASSIGN OWNED: it would hand whatever the role
-- still owns to the current user and make the "still owns something" check pass vacuously.
-- The block refuses while schema aicp still exists, and while ANY object anywhere in the cluster is still
-- owned by the role. Only then it runs DROP OWNED (which here only revokes the role's grants, e.g.
-- GRANT USAGE ON SCHEMA auth TO aicp_migrator) and DROP ROLE.
-- DO $$ DECLARE r text; n bigint; BEGIN
--   IF current_setting('e2e.rollback_ack', true) IS DISTINCT FROM 'DISPOSABLE-TEST-PROJECT-ONLY' THEN
--     RAISE EXCEPTION 'rollback not acknowledged'; END IF;
--   IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'aicp') THEN
--     RAISE EXCEPTION 'schema aicp still exists; run section 3 first; stop'; END IF;
--   FOREACH r IN ARRAY ARRAY['knowledge_runtime', 'aicp_migrator'] LOOP
--     CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
--     SELECT count(*) INTO n FROM pg_shdepend d JOIN pg_roles ro ON ro.oid = d.refobjid
--       WHERE ro.rolname = r AND d.deptype = 'o';
--     IF n > 0 THEN RAISE EXCEPTION 'role % still owns % object(s) (any database); stop', r, n; END IF;
--     EXECUTE format('DROP OWNED BY %I', r);
--     EXECUTE format('DROP ROLE %I', r);
--   END LOOP;
-- END $$;
-- If the preflight showed the roles pre-existed, DO NOT run this section at all.

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
