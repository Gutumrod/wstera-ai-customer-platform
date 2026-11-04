-- Core Contract v0.1 §3.4: per-version knowledge visibility.
--
-- Visibility is chosen once when the version is created and can never change.
-- Changing it on an existing version would let a citation that was produced for
-- one audience stay valid for another, so the fix is a new version instead.
--
-- Rollback:
--   DROP TRIGGER knowledge_version_visibility_guard ON aicp.knowledge_versions;
--   DROP FUNCTION aicp.protect_knowledge_version_visibility();
--   ALTER TABLE aicp.knowledge_versions DROP COLUMN visibility;
ALTER TABLE aicp.knowledge_versions
  ADD COLUMN visibility text NOT NULL DEFAULT 'internal'
  CHECK (visibility IN ('internal', 'customer'));

CREATE FUNCTION aicp.protect_knowledge_version_visibility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    RAISE EXCEPTION 'knowledge version visibility is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER knowledge_version_visibility_guard
  BEFORE UPDATE ON aicp.knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION aicp.protect_knowledge_version_visibility();

-- INSERT is column-scoped (20261023000100_g1_workspace_host.sql:103); the runtime
-- role writes visibility once and never receives UPDATE on it.
GRANT INSERT (visibility) ON aicp.knowledge_versions TO knowledge_runtime;
REVOKE UPDATE (visibility) ON aicp.knowledge_versions FROM knowledge_runtime;
