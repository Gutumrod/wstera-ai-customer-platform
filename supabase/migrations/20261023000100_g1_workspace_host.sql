-- Workspace membership and connection ownership for the authenticated merchant host.
CREATE TABLE aicp.workspaces (
  workspace_id text PRIMARY KEY CHECK (workspace_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE aicp.workspace_memberships (
  workspace_id text NOT NULL REFERENCES aicp.workspaces(workspace_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'staff')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX workspace_memberships_user_lookup
  ON aicp.workspace_memberships (user_id, status, workspace_id);

CREATE TABLE aicp.workspace_connections (
  workspace_id text NOT NULL REFERENCES aicp.workspaces(workspace_id) ON DELETE CASCADE,
  connection_id text NOT NULL CHECK (connection_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  channel text NOT NULL CHECK (channel IN ('web', 'line')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, connection_id),
  UNIQUE (connection_id, channel)
);

ALTER TABLE aicp.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE aicp.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE aicp.workspace_connections ENABLE ROW LEVEL SECURITY;

-- This narrowly scoped SECURITY DEFINER wrapper is owned by the migration caller,
-- which can use auth.uid() without giving the product owner access to auth.
CREATE FUNCTION aicp.current_auth_uid() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$ SELECT auth.uid() $$;
REVOKE ALL ON FUNCTION aicp.current_auth_uid() FROM PUBLIC;

CREATE FUNCTION aicp.is_active_workspace_member(target_workspace_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, aicp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM aicp.workspace_memberships AS membership
    JOIN aicp.workspaces AS workspace USING (workspace_id)
    WHERE membership.workspace_id = target_workspace_id
      AND membership.user_id = (SELECT aicp.current_auth_uid())
      AND membership.status = 'active'
      AND workspace.status = 'active'
  )
$$;
REVOKE ALL ON FUNCTION aicp.is_active_workspace_member(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aicp.is_active_workspace_member(text) TO authenticated;

CREATE POLICY workspaces_member_read ON aicp.workspaces
  FOR SELECT TO authenticated
  USING (status = 'active' AND aicp.is_active_workspace_member(workspace_id));

CREATE POLICY workspace_memberships_self_read ON aicp.workspace_memberships
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND aicp.is_active_workspace_member(workspace_id));

CREATE POLICY workspace_connections_member_read ON aicp.workspace_connections
  FOR SELECT TO authenticated
  USING (aicp.is_active_workspace_member(workspace_id));

GRANT USAGE ON SCHEMA aicp TO authenticated;
GRANT SELECT ON aicp.workspaces, aicp.workspace_memberships, aicp.workspace_connections TO authenticated;

-- Product-owned schema role; credentials are provisioned outside migrations.
DO $$
DECLARE existing_role record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole, rolreplication, rolinherit
    INTO existing_role FROM pg_roles WHERE rolname = 'aicp_migrator';
  IF NOT FOUND THEN
    EXECUTE 'CREATE ROLE aicp_migrator NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT';
  ELSIF existing_role.rolsuper OR existing_role.rolbypassrls OR existing_role.rolcanlogin
     OR existing_role.rolcreatedb OR existing_role.rolcreaterole OR existing_role.rolreplication OR existing_role.rolinherit THEN
    RAISE EXCEPTION 'AICP_MIGRATOR_ROLE_UNSAFE: expected NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOINHERIT' USING ERRCODE = '42501';
  END IF;
END $$;
DO $$
DECLARE existing_role record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole, rolreplication, rolinherit
    INTO existing_role FROM pg_roles WHERE rolname = 'knowledge_runtime';
  IF NOT FOUND THEN
    EXECUTE 'CREATE ROLE knowledge_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT';
  ELSIF existing_role.rolsuper OR existing_role.rolbypassrls OR existing_role.rolcreatedb
     OR existing_role.rolcreaterole OR existing_role.rolreplication OR existing_role.rolinherit THEN
    RAISE EXCEPTION 'KNOWLEDGE_RUNTIME_ROLE_UNSAFE: expected NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOINHERIT' USING ERRCODE = '42501';
  END IF;
END $$;

-- Request SET only for this migration; revoke only the SET option afterwards so the creator's ADMIN option lets later files re-request it.
DO $$ BEGIN
  EXECUTE format('GRANT aicp_migrator TO %I WITH INHERIT FALSE, SET TRUE', session_user);
END $$;

-- The hosted migration caller owns these objects before this handoff.
GRANT USAGE, CREATE ON SCHEMA aicp TO aicp_migrator;
ALTER TABLE aicp.knowledge_sources OWNER TO aicp_migrator;
ALTER TABLE aicp.knowledge_versions OWNER TO aicp_migrator;
ALTER TABLE aicp.knowledge_chunks OWNER TO aicp_migrator;
ALTER TABLE aicp.workspaces OWNER TO aicp_migrator;
ALTER TABLE aicp.workspace_memberships OWNER TO aicp_migrator;
ALTER TABLE aicp.workspace_connections OWNER TO aicp_migrator;
ALTER FUNCTION aicp.protect_knowledge_version_identity() OWNER TO aicp_migrator;
ALTER FUNCTION aicp.guard_knowledge_chunk_insert() OWNER TO aicp_migrator;
ALTER FUNCTION aicp.is_active_workspace_member(text) OWNER TO aicp_migrator;
GRANT EXECUTE ON FUNCTION aicp.current_auth_uid() TO aicp_migrator;
ALTER SCHEMA aicp OWNER TO aicp_migrator;

-- Keep the bucket private. The hosted migration role can INSERT/UPDATE but may not
-- have SELECT on storage.buckets; use the upsert only when its ACL permits it.
-- Without SELECT, a conflicting pre-existing id fails closed instead of widening grants.
DO $$ BEGIN
  IF has_table_privilege(session_user, 'storage.buckets', 'SELECT') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('knowledge-originals', 'knowledge-originals', false, 5242880,
            ARRAY['application/pdf', 'text/csv', 'text/plain', 'application/vnd.ms-excel'])
    ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  ELSE
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('knowledge-originals', 'knowledge-originals', false, 5242880,
            ARRAY['application/pdf', 'text/csv', 'text/plain', 'application/vnd.ms-excel']);
  END IF;
END $$;

SET ROLE aicp_migrator;
DO $$ BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA aicp TO %I', session_user);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON aicp.workspaces, aicp.workspace_memberships, aicp.workspace_connections TO %I', session_user);
END $$;

GRANT USAGE ON SCHEMA aicp TO knowledge_runtime;
GRANT SELECT ON aicp.knowledge_sources, aicp.knowledge_versions, aicp.knowledge_chunks TO knowledge_runtime;
GRANT INSERT (workspace_id, source_id, kind, title, created_at) ON aicp.knowledge_sources TO knowledge_runtime;
GRANT UPDATE (status) ON aicp.knowledge_sources TO knowledge_runtime;
GRANT INSERT (workspace_id, source_id, version_id, kind, title, content, created_at)
  ON aicp.knowledge_versions TO knowledge_runtime;
GRANT UPDATE (status, approved_at, approved_by, revoked_at, revoked_by, revocation_reason)
  ON aicp.knowledge_versions TO knowledge_runtime;
GRANT INSERT, SELECT ON aicp.knowledge_chunks TO knowledge_runtime;

CREATE TABLE aicp.knowledge_quarantine_records (
  workspace_id text NOT NULL CHECK (workspace_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  attempt_id text NOT NULL CHECK (attempt_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 12 AND 128),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  kind text NOT NULL CHECK (kind IN ('pdf', 'csv')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  filename text CHECK (filename IS NULL OR char_length(filename) BETWEEN 1 AND 128),
  content_type text CHECK (content_type IS NULL OR char_length(content_type) BETWEEN 1 AND 120),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  object_path text,
  failure_code text NOT NULL CHECK (char_length(failure_code) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, attempt_id),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE aicp.knowledge_original_objects (
  workspace_id text NOT NULL,
  source_id text NOT NULL,
  version_id text NOT NULL,
  object_path text NOT NULL CHECK (char_length(object_path) BETWEEN 1 AND 512),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 128),
  content_type text NOT NULL CHECK (char_length(content_type) BETWEEN 1 AND 120),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, source_id, version_id),
  FOREIGN KEY (workspace_id, source_id, version_id)
    REFERENCES aicp.knowledge_versions (workspace_id, source_id, version_id) ON DELETE CASCADE
);
ALTER TABLE aicp.knowledge_original_objects OWNER TO aicp_migrator;
ALTER TABLE aicp.knowledge_quarantine_records OWNER TO aicp_migrator;
ALTER TABLE aicp.knowledge_original_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE aicp.knowledge_original_objects FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_original_objects_workspace_policy ON aicp.knowledge_original_objects
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT ON aicp.knowledge_original_objects TO knowledge_runtime;

ALTER TABLE aicp.knowledge_quarantine_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE aicp.knowledge_quarantine_records FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_quarantine_workspace_policy ON aicp.knowledge_quarantine_records
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));
GRANT SELECT, INSERT ON aicp.knowledge_quarantine_records TO knowledge_runtime;
GRANT UPDATE (object_path) ON aicp.knowledge_quarantine_records TO knowledge_runtime;

RESET ROLE;
DO $$ BEGIN
  EXECUTE format('REVOKE SET OPTION FOR aicp_migrator FROM %I', session_user);
END $$;
