-- HOST-002 fix (F1): revocation and archiving move out of the direct-Postgres runtime role, the way approval did
-- in 20261103000100. The actor comes from auth.uid(), never from a caller, and only an active owner may act.

DO $$
DECLARE role_state record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole, rolreplication, rolinherit
    INTO role_state FROM pg_roles WHERE rolname = 'aicp_migrator';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AICP_MIGRATOR_ROLE_MISSING' USING ERRCODE = '42501';
  END IF;
  IF role_state.rolsuper OR role_state.rolbypassrls OR role_state.rolcanlogin
     OR role_state.rolcreatedb OR role_state.rolcreaterole OR role_state.rolreplication OR role_state.rolinherit THEN
    RAISE EXCEPTION 'AICP_MIGRATOR_ROLE_UNSAFE' USING ERRCODE = '42501';
  END IF;
  EXECUTE format('GRANT aicp_migrator TO %I WITH INHERIT FALSE, SET TRUE', session_user);
END $$;

SET ROLE aicp_migrator;

CREATE FUNCTION aicp.revoke_knowledge_version(target_workspace_id text, target_source_id text, target_version_id text, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aicp
AS $$
DECLARE
  revoker text := (SELECT aicp.current_auth_uid())::text;
  version_status text;
BEGIN
  IF revoker IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE = 'AC001';
  END IF;
  IF aicp.assert_active_knowledge_writer(target_workspace_id, revoker) <> 'owner' THEN
    RAISE EXCEPTION 'OWNER_ROLE_REQUIRED' USING ERRCODE = 'AC001';
  END IF;
  IF reason IS NULL OR btrim(reason) = '' OR char_length(reason) > 500 THEN
    RAISE EXCEPTION 'INVALID_KNOWLEDGE_INPUT' USING ERRCODE = 'AC001';
  END IF;
  PERFORM set_config('app.workspace_id', target_workspace_id, true);

  PERFORM 1 FROM aicp.knowledge_sources AS source
  WHERE source.workspace_id = target_workspace_id AND source.source_id = target_source_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOURCE_NOT_FOUND' USING ERRCODE = 'AC001';
  END IF;

  SELECT version.status INTO version_status
  FROM aicp.knowledge_versions AS version
  WHERE version.workspace_id = target_workspace_id AND version.source_id = target_source_id
    AND version.version_id = target_version_id
  FOR UPDATE;
  IF version_status IS NULL THEN
    RAISE EXCEPTION 'VERSION_NOT_FOUND' USING ERRCODE = 'AC001';
  END IF;
  IF version_status <> 'approved' THEN
    RAISE EXCEPTION 'REVOCATION_NOT_ELIGIBLE' USING ERRCODE = 'AC001';
  END IF;

  UPDATE aicp.knowledge_versions AS version
  SET status = 'revoked', revoked_at = now(), revoked_by = revoker, revocation_reason = reason
  WHERE version.workspace_id = target_workspace_id AND version.source_id = target_source_id
    AND version.version_id = target_version_id;
END;
$$;
REVOKE ALL ON FUNCTION aicp.revoke_knowledge_version(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aicp.revoke_knowledge_version(text, text, text, text) TO authenticated;

CREATE FUNCTION aicp.archive_knowledge_source(target_workspace_id text, target_source_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aicp
AS $$
DECLARE
  archiver text := (SELECT aicp.current_auth_uid())::text;
BEGIN
  IF archiver IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE = 'AC001';
  END IF;
  IF aicp.assert_active_knowledge_writer(target_workspace_id, archiver) <> 'owner' THEN
    RAISE EXCEPTION 'OWNER_ROLE_REQUIRED' USING ERRCODE = 'AC001';
  END IF;
  PERFORM set_config('app.workspace_id', target_workspace_id, true);

  UPDATE aicp.knowledge_sources AS source
  SET status = 'archived'
  WHERE source.workspace_id = target_workspace_id AND source.source_id = target_source_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOURCE_NOT_FOUND' USING ERRCODE = 'AC001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION aicp.archive_knowledge_source(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aicp.archive_knowledge_source(text, text) TO authenticated;

-- Kept on knowledge_runtime: UPDATE (status) on knowledge_versions for the ingest transitions (uploaded..indexed,
-- quarantined, failed). A status-only flip to 'revoked' fails the CHECK that demands revoked_at, revoked_by and
-- revocation_reason, which the role can no longer set.
REVOKE UPDATE (revoked_at, revoked_by, revocation_reason) ON aicp.knowledge_versions FROM knowledge_runtime;
REVOKE UPDATE (status) ON aicp.knowledge_sources FROM knowledge_runtime;

-- Archiving is no longer an ingest step, but ingest still takes SELECT ... FOR UPDATE row locks on knowledge_sources
-- (createSource conflict path, createVersion, approveVersion), and Postgres needs an UPDATE column privilege for
-- that. created_at is the lock handle: the trigger below makes it, and every identity column, immutable, so the
-- grant cannot rewrite anything. status changes only through archive_knowledge_source (runs as aicp_migrator).
GRANT UPDATE (created_at) ON aicp.knowledge_sources TO knowledge_runtime;

CREATE FUNCTION aicp.protect_knowledge_source_identity() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, aicp
AS $$
BEGIN
  IF ROW(NEW.workspace_id, NEW.source_id, NEW.kind, NEW.title, NEW.created_at)
      IS DISTINCT FROM
     ROW(OLD.workspace_id, OLD.source_id, OLD.kind, OLD.title, OLD.created_at) THEN
    RAISE EXCEPTION 'knowledge source identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION aicp.protect_knowledge_source_identity() OWNER TO aicp_migrator;

CREATE TRIGGER knowledge_source_identity_guard
  BEFORE UPDATE ON aicp.knowledge_sources
  FOR EACH ROW EXECUTE FUNCTION aicp.protect_knowledge_source_identity();

RESET ROLE;
DO $$ BEGIN
  EXECUTE format('REVOKE SET OPTION FOR aicp_migrator FROM %I', session_user);
END $$;
