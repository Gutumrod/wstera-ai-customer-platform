-- HOST-002: split approval from ingest, re-check membership inside write transactions,
-- hide LINE connections from members, and allow one active web connection per workspace.

-- Runs inside each knowledge write. FOR SHARE makes a concurrent revocation or suspension wait for this
-- transaction to finish; it needs privileges the runtime role must not hold, hence SECURITY DEFINER rather
-- than a SELECT grant plus a new RLS policy. The actor comes from the server's verified session.
CREATE FUNCTION aicp.assert_active_knowledge_writer(target_workspace_id text, actor_user_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aicp
AS $$
DECLARE
  actor_role text;
BEGIN
  SELECT membership.role INTO actor_role
  FROM aicp.workspace_memberships AS membership
  JOIN aicp.workspaces AS workspace USING (workspace_id)
  WHERE membership.workspace_id = target_workspace_id
    AND membership.user_id::text = actor_user_id
    AND membership.status = 'active'
    AND workspace.status = 'active'
  FOR SHARE OF membership, workspace;
  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE = 'AC001';
  END IF;
  RETURN actor_role;
END;
$$;
ALTER FUNCTION aicp.assert_active_knowledge_writer(text, text) OWNER TO aicp_migrator;
REVOKE ALL ON FUNCTION aicp.assert_active_knowledge_writer(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aicp.assert_active_knowledge_writer(text, text) TO knowledge_runtime;

-- Owner approval runs as the signed-in user and takes the approver from auth.uid(), never from a caller.
-- knowledge_versions forces RLS on its owner, so the function scopes itself after checking ownership.
CREATE FUNCTION aicp.approve_knowledge_version(target_workspace_id text, target_source_id text, target_version_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, aicp
AS $$
DECLARE
  approver text := (SELECT auth.uid())::text;
  source_status text;
  version_status text;
BEGIN
  IF approver IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_REQUIRED' USING ERRCODE = 'AC001';
  END IF;
  IF aicp.assert_active_knowledge_writer(target_workspace_id, approver) <> 'owner' THEN
    RAISE EXCEPTION 'OWNER_ROLE_REQUIRED' USING ERRCODE = 'AC001';
  END IF;
  PERFORM set_config('app.workspace_id', target_workspace_id, true);

  SELECT source.status INTO source_status
  FROM aicp.knowledge_sources AS source
  WHERE source.workspace_id = target_workspace_id AND source.source_id = target_source_id
  FOR UPDATE;
  IF source_status IS NULL THEN
    RAISE EXCEPTION 'SOURCE_NOT_FOUND' USING ERRCODE = 'AC001';
  END IF;
  IF source_status <> 'active' THEN
    RAISE EXCEPTION 'APPROVAL_NOT_ELIGIBLE' USING ERRCODE = 'AC001';
  END IF;

  SELECT version.status INTO version_status
  FROM aicp.knowledge_versions AS version
  WHERE version.workspace_id = target_workspace_id AND version.source_id = target_source_id
    AND version.version_id = target_version_id
  FOR UPDATE;
  IF version_status IS NULL THEN
    RAISE EXCEPTION 'VERSION_NOT_FOUND' USING ERRCODE = 'AC001';
  END IF;
  IF version_status <> 'indexed' OR NOT EXISTS (
    SELECT 1 FROM aicp.knowledge_chunks AS chunk
    WHERE chunk.workspace_id = target_workspace_id AND chunk.source_id = target_source_id
      AND chunk.version_id = target_version_id
  ) THEN
    RAISE EXCEPTION 'APPROVAL_NOT_ELIGIBLE' USING ERRCODE = 'AC001';
  END IF;

  UPDATE aicp.knowledge_versions AS version
  SET status = 'approved', approved_at = now(), approved_by = approver
  WHERE version.workspace_id = target_workspace_id AND version.source_id = target_source_id
    AND version.version_id = target_version_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'APPROVED_VERSION_EXISTS' USING ERRCODE = 'AC001';
END;
$$;
ALTER FUNCTION aicp.approve_knowledge_version(text, text, text) OWNER TO aicp_migrator;
REVOKE ALL ON FUNCTION aicp.approve_knowledge_version(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aicp.approve_knowledge_version(text, text, text) TO authenticated;

-- Without these columns the status CHECK stops the runtime role from reaching 'approved' on its own.
REVOKE UPDATE (approved_at, approved_by) ON aicp.knowledge_versions FROM knowledge_runtime;

DROP POLICY workspace_connections_member_read ON aicp.workspace_connections;
CREATE POLICY workspace_connections_member_read ON aicp.workspace_connections
  FOR SELECT TO authenticated
  USING (channel = 'web' AND aicp.is_active_workspace_member(workspace_id));

CREATE UNIQUE INDEX workspace_one_active_web_connection
  ON aicp.workspace_connections (workspace_id)
  WHERE channel = 'web' AND status = 'active';
