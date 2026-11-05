-- Runtime configuration required by the public Web Chat host.
DO $$ BEGIN
  EXECUTE format('GRANT aicp_migrator TO %I WITH INHERIT FALSE, SET TRUE', session_user);
END $$;

SET ROLE aicp_migrator;

ALTER TABLE aicp.workspace_connections
  ADD COLUMN allowed_origins text[] NOT NULL DEFAULT '{}';

ALTER TABLE aicp.workspaces
  ADD COLUMN query_aliases jsonb NOT NULL DEFAULT '[]'::jsonb
  CONSTRAINT workspaces_query_aliases_array CHECK (jsonb_typeof(query_aliases) = 'array');

CREATE POLICY workspaces_web_runtime_read ON aicp.workspaces
  FOR SELECT TO knowledge_runtime USING (status = 'active');
CREATE POLICY workspace_connections_web_runtime_read ON aicp.workspace_connections
  FOR SELECT TO knowledge_runtime USING (channel = 'web' AND status = 'active');

GRANT SELECT (workspace_id, status, query_aliases) ON aicp.workspaces TO knowledge_runtime;
GRANT SELECT (workspace_id, connection_id, channel, status, allowed_origins)
  ON aicp.workspace_connections TO knowledge_runtime;

RESET ROLE;
DO $$ BEGIN
  EXECUTE format('REVOKE SET OPTION FOR aicp_migrator FROM %I', session_user);
END $$;
