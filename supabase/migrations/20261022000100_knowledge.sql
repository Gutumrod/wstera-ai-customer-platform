CREATE TABLE knowledge_sources (
  workspace_id text NOT NULL,
  source_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('faq', 'pdf', 'csv')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, source_id)
);

CREATE TABLE knowledge_versions (
  workspace_id text NOT NULL,
  source_id text NOT NULL,
  version_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('faq', 'pdf', 'csv')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 100000),
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'validating', 'extracting', 'indexed', 'approved', 'quarantined', 'failed', 'revoked')),
  created_at timestamptz NOT NULL,
  approved_at timestamptz,
  approved_by text,
  revoked_at timestamptz,
  revoked_by text,
  revocation_reason text,
  PRIMARY KEY (workspace_id, source_id, version_id),
  FOREIGN KEY (workspace_id, source_id) REFERENCES knowledge_sources (workspace_id, source_id),
  CHECK (
    (status IN ('approved', 'revoked') AND approved_at IS NOT NULL AND approved_by IS NOT NULL)
    OR (status NOT IN ('approved', 'revoked') AND approved_at IS NULL AND approved_by IS NULL)
  ),
  CHECK (
    (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
    OR (status <> 'revoked' AND revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
  )
);

CREATE UNIQUE INDEX knowledge_one_approved_version_per_source
  ON knowledge_versions (workspace_id, source_id)
  WHERE status = 'approved';

CREATE TABLE knowledge_chunks (
  workspace_id text NOT NULL,
  source_id text NOT NULL,
  version_id text NOT NULL,
  chunk_id text NOT NULL,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 320),
  locator_kind text NOT NULL CHECK (locator_kind IN ('span', 'page', 'row', 'chunk')),
  locator_chunk_index integer NOT NULL CHECK (locator_chunk_index >= 0),
  locator_position integer,
  start_offset integer NOT NULL CHECK (start_offset >= 0),
  end_offset integer NOT NULL CHECK (end_offset > start_offset),
  PRIMARY KEY (workspace_id, source_id, version_id, chunk_id),
  UNIQUE (workspace_id, source_id, version_id, chunk_index),
  FOREIGN KEY (workspace_id, source_id, version_id)
    REFERENCES knowledge_versions (workspace_id, source_id, version_id) ON DELETE CASCADE,
  CHECK (
    (locator_kind IN ('page', 'row') AND locator_position >= 1)
    OR (locator_kind IN ('span', 'chunk') AND locator_position IS NULL)
  )
);

CREATE FUNCTION protect_knowledge_version_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.workspace_id, NEW.source_id, NEW.version_id, NEW.kind, NEW.title, NEW.content, NEW.created_at)
      IS DISTINCT FROM
     ROW(OLD.workspace_id, OLD.source_id, OLD.version_id, OLD.kind, OLD.title, OLD.content, OLD.created_at) THEN
    RAISE EXCEPTION 'knowledge version content is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'revoked' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'revoked knowledge version is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'approved' AND NEW.status NOT IN ('approved', 'revoked') THEN
    RAISE EXCEPTION 'approved knowledge version must be revoked before replacement' USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('approved', 'revoked') AND ROW(NEW.approved_at, NEW.approved_by)
      IS DISTINCT FROM ROW(OLD.approved_at, OLD.approved_by) THEN
    RAISE EXCEPTION 'approval metadata is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'indexed' AND NEW.status = 'approved' AND NOT EXISTS (
    SELECT 1 FROM knowledge_chunks AS chunk
    WHERE chunk.workspace_id = OLD.workspace_id AND chunk.source_id = OLD.source_id AND chunk.version_id = OLD.version_id
  ) THEN
    RAISE EXCEPTION 'knowledge version needs chunks before approval' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> NEW.status AND NOT (
    (OLD.status = 'uploaded' AND NEW.status IN ('validating', 'quarantined', 'failed'))
    OR (OLD.status = 'validating' AND NEW.status IN ('extracting', 'quarantined', 'failed'))
    OR (OLD.status = 'extracting' AND NEW.status IN ('indexed', 'quarantined', 'failed'))
    OR (OLD.status = 'indexed' AND NEW.status IN ('approved', 'quarantined', 'failed'))
    OR (OLD.status = 'approved' AND NEW.status = 'revoked')
    OR (OLD.status = 'failed' AND NEW.status = 'validating')
  ) THEN
    RAISE EXCEPTION 'invalid knowledge version transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER knowledge_version_identity_guard
  BEFORE UPDATE ON knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION protect_knowledge_version_identity();

CREATE FUNCTION guard_knowledge_chunk_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_status text;
BEGIN
  -- Serialize insertion with approval's UPDATE of this same version row.
  -- A plain RLS EXISTS check is not sufficient: its statement snapshot can
  -- observe `indexed` while a concurrent approval commits first.
  SELECT status INTO parent_status
  FROM knowledge_versions
  WHERE workspace_id = NEW.workspace_id
    AND source_id = NEW.source_id
    AND version_id = NEW.version_id
  FOR UPDATE;

  IF parent_status IS NULL OR parent_status NOT IN ('uploaded', 'validating', 'extracting', 'indexed') THEN
    RAISE EXCEPTION 'knowledge chunks can only be added before approval' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER knowledge_chunk_insert_guard
  BEFORE INSERT ON knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION guard_knowledge_chunk_insert();

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_sources_workspace_policy ON knowledge_sources
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));

ALTER TABLE knowledge_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_versions_workspace_policy ON knowledge_versions
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));

ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY knowledge_chunks_workspace_policy ON knowledge_chunks
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (
    workspace_id = current_setting('app.workspace_id', true)
    AND EXISTS (
      SELECT 1 FROM knowledge_versions AS version
      WHERE version.workspace_id = knowledge_chunks.workspace_id
        AND version.source_id = knowledge_chunks.source_id
        AND version.version_id = knowledge_chunks.version_id
        AND version.status IN ('uploaded', 'validating', 'extracting', 'indexed')
    )
  );

CREATE INDEX knowledge_retrievable_versions
  ON knowledge_versions (workspace_id, source_id, status, version_id);
CREATE INDEX knowledge_chunks_order
  ON knowledge_chunks (workspace_id, source_id, version_id, chunk_index);
