-- Durable Web Chat conversation state, immutable events, messages, and staff outbox.
DO $$ BEGIN
  EXECUTE format('GRANT aicp_migrator TO %I WITH INHERIT FALSE, SET TRUE', session_user);
END $$;

SET ROLE aicp_migrator;

CREATE TABLE aicp.conversations (
  workspace_id text NOT NULL REFERENCES aicp.workspaces(workspace_id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  status text NOT NULL DEFAULT 'ai_active' CHECK (status IN ('ai_active', 'handoff_requested', 'human_active')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  handoff_reason text CHECK (handoff_reason IN ('customer_requested', 'no_answer', 'conflicting_evidence')),
  assigned_staff_id text,
  last_staff_delivery_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, conversation_id)
);

CREATE TABLE aicp.conversation_events (
  workspace_id text NOT NULL,
  conversation_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  event_kind text NOT NULL CHECK (event_kind IN ('handoff_requested', 'operator_claimed', 'staff_reply_delivered', 'handoff_released')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, conversation_id, version),
  FOREIGN KEY (workspace_id, conversation_id) REFERENCES aicp.conversations(workspace_id, conversation_id) ON DELETE CASCADE
);

CREATE TABLE aicp.conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  conversation_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('customer', 'bot', 'staff')),
  body text NOT NULL CHECK (char_length(body) <= 5000),
  staff_id text,
  delivery_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, conversation_id) REFERENCES aicp.conversations(workspace_id, conversation_id) ON DELETE CASCADE,
  UNIQUE (workspace_id, delivery_id)
);

CREATE TABLE aicp.handoff_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL,
  conversation_id text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('no_answer', 'conflicting_evidence')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, conversation_id) REFERENCES aicp.conversations(workspace_id, conversation_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX handoff_notifications_one_open_request
  ON aicp.handoff_notifications (workspace_id, conversation_id) WHERE status IN ('pending', 'processing');
CREATE INDEX conversation_messages_read_order
  ON aicp.conversation_messages (workspace_id, conversation_id, created_at, id);

CREATE FUNCTION aicp.reject_conversation_event_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'CONVERSATION_EVENTS_IMMUTABLE' USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER conversation_events_immutable
  BEFORE UPDATE OR DELETE ON aicp.conversation_events
  FOR EACH ROW EXECUTE FUNCTION aicp.reject_conversation_event_mutation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['conversations', 'conversation_events', 'conversation_messages', 'handoff_notifications'] LOOP
    EXECUTE format('ALTER TABLE aicp.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE aicp.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON aicp.%I USING (workspace_id = current_setting(''app.workspace_id'', true)) WITH CHECK (workspace_id = current_setting(''app.workspace_id'', true))', table_name || '_workspace_isolation', table_name);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON aicp.conversations TO knowledge_runtime;
GRANT SELECT, INSERT ON aicp.conversation_events TO knowledge_runtime;
GRANT SELECT, INSERT ON aicp.conversation_messages TO knowledge_runtime;
GRANT SELECT, INSERT, UPDATE ON aicp.handoff_notifications TO knowledge_runtime;
GRANT USAGE ON SCHEMA aicp TO knowledge_runtime;
GRANT EXECUTE ON FUNCTION aicp.reject_conversation_event_mutation() TO knowledge_runtime;

RESET ROLE;
DO $$ BEGIN
  EXECUTE format('REVOKE SET OPTION FOR aicp_migrator FROM %I', session_user);
END $$;
