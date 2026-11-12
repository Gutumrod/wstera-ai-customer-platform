-- Structured shop profile and product catalog versions for workspace-scoped customer answers.
--
-- Follows the knowledge version lifecycle conventions: draft -> approved -> revoked,
-- at most one approved profile per workspace and one approved catalog row per (workspace, sku),
-- immutable content, workspace RLS, and column-scoped runtime grants.
--
-- Rollback:
--   DROP TRIGGER shop_profile_version_identity_guard ON aicp.shop_profile_versions;
--   DROP FUNCTION aicp.protect_shop_profile_version_identity();
--   DROP TRIGGER catalog_item_version_identity_guard ON aicp.catalog_item_versions;
--   DROP FUNCTION aicp.protect_catalog_item_version_identity();
--   DROP TABLE aicp.catalog_item_versions;
--   DROP TABLE aicp.shop_profile_versions;

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

CREATE TABLE aicp.shop_profile_versions (
  workspace_id text NOT NULL,
  version_id text NOT NULL,
  profile jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'revoked')),
  created_at timestamptz NOT NULL,
  approved_at timestamptz,
  approved_by text,
  revoked_at timestamptz,
  revoked_by text,
  revocation_reason text,
  PRIMARY KEY (workspace_id, version_id),
  CHECK (
    (status IN ('approved', 'revoked') AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
    OR (status NOT IN ('approved', 'revoked') AND approved_at IS NULL AND approved_by IS NULL)
  ),
  CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
    OR (status <> 'revoked' AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
  )
);

CREATE UNIQUE INDEX shop_profile_one_approved_per_workspace
  ON aicp.shop_profile_versions (workspace_id)
  WHERE status = 'approved';

CREATE FUNCTION aicp.protect_shop_profile_version_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.workspace_id, NEW.version_id, NEW.profile, NEW.created_at)
      IS DISTINCT FROM
     ROW(OLD.workspace_id, OLD.version_id, OLD.profile, OLD.created_at) THEN
    RAISE EXCEPTION 'shop profile version content is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'revoked' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'revoked shop profile version is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'revoked') THEN
    RAISE EXCEPTION 'approved shop profile version must be revoked before replacement' USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('approved', 'revoked') AND ROW(NEW.approved_at, NEW.approved_by)
      IS DISTINCT FROM ROW(OLD.approved_at, OLD.approved_by) THEN
    RAISE EXCEPTION 'approval metadata is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'draft' AND NEW.status = 'approved')
    OR (OLD.status = 'approved' AND NEW.status = 'revoked')
  ) THEN
    RAISE EXCEPTION 'invalid shop profile version transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER shop_profile_version_identity_guard
  BEFORE UPDATE ON aicp.shop_profile_versions
  FOR EACH ROW EXECUTE FUNCTION aicp.protect_shop_profile_version_identity();

CREATE TABLE aicp.catalog_item_versions (
  workspace_id text NOT NULL,
  sku text NOT NULL,
  version_id text NOT NULL,
  name text NOT NULL,
  fitments text[] NOT NULL,
  price_thb integer NOT NULL CHECK (price_thb >= 0 AND price_thb <= 10000000),
  stock_status text NOT NULL CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'made_to_order')),
  note text NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'revoked')),
  created_at timestamptz NOT NULL,
  approved_at timestamptz,
  approved_by text,
  revoked_at timestamptz,
  revoked_by text,
  revocation_reason text,
  PRIMARY KEY (workspace_id, sku, version_id),
  CHECK (
    (status IN ('approved', 'revoked') AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
    OR (status NOT IN ('approved', 'revoked') AND approved_at IS NULL AND approved_by IS NULL)
  ),
  CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
    OR (status <> 'revoked' AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
  )
);

CREATE UNIQUE INDEX catalog_item_one_approved_per_sku
  ON aicp.catalog_item_versions (workspace_id, sku)
  WHERE status = 'approved';

CREATE INDEX catalog_item_versions_workspace_status_sku
  ON aicp.catalog_item_versions (workspace_id, status, sku);

CREATE FUNCTION aicp.protect_catalog_item_version_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.workspace_id, NEW.sku, NEW.version_id, NEW.name, NEW.fitments, NEW.price_thb, NEW.stock_status, NEW.note, NEW.created_at)
      IS DISTINCT FROM
     ROW(OLD.workspace_id, OLD.sku, OLD.version_id, OLD.name, OLD.fitments, OLD.price_thb, OLD.stock_status, OLD.note, OLD.created_at) THEN
    RAISE EXCEPTION 'catalog item version content is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'revoked' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'revoked catalog item version is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'revoked') THEN
    RAISE EXCEPTION 'approved catalog item version must be revoked before replacement' USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('approved', 'revoked') AND ROW(NEW.approved_at, NEW.approved_by)
      IS DISTINCT FROM ROW(OLD.approved_at, OLD.approved_by) THEN
    RAISE EXCEPTION 'approval metadata is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'draft' AND NEW.status = 'approved')
    OR (OLD.status = 'approved' AND NEW.status = 'revoked')
  ) THEN
    RAISE EXCEPTION 'invalid catalog item version transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_item_version_identity_guard
  BEFORE UPDATE ON aicp.catalog_item_versions
  FOR EACH ROW EXECUTE FUNCTION aicp.protect_catalog_item_version_identity();

ALTER TABLE aicp.shop_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE aicp.shop_profile_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY shop_profile_versions_workspace_policy ON aicp.shop_profile_versions
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));

ALTER TABLE aicp.catalog_item_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE aicp.catalog_item_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY catalog_item_versions_workspace_policy ON aicp.catalog_item_versions
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));

ALTER TABLE aicp.shop_profile_versions OWNER TO aicp_migrator;
ALTER TABLE aicp.catalog_item_versions OWNER TO aicp_migrator;
ALTER FUNCTION aicp.protect_shop_profile_version_identity() OWNER TO aicp_migrator;
ALTER FUNCTION aicp.protect_catalog_item_version_identity() OWNER TO aicp_migrator;

GRANT SELECT ON aicp.shop_profile_versions, aicp.catalog_item_versions TO knowledge_runtime;
GRANT INSERT (workspace_id, version_id, profile, created_at) ON aicp.shop_profile_versions TO knowledge_runtime;
GRANT UPDATE (status, approved_at, approved_by, revoked_at, revoked_by, revocation_reason)
  ON aicp.shop_profile_versions TO knowledge_runtime;
GRANT INSERT (workspace_id, sku, version_id, name, fitments, price_thb, stock_status, note, created_at)
  ON aicp.catalog_item_versions TO knowledge_runtime;
GRANT UPDATE (status, approved_at, approved_by, revoked_at, revoked_by, revocation_reason)
  ON aicp.catalog_item_versions TO knowledge_runtime;

RESET ROLE;

DO $$ BEGIN
  EXECUTE format('REVOKE SET OPTION FOR aicp_migrator FROM %I', session_user);
END $$;
