-- Durable model usage ledger and per-workspace daily spend guard. Stores counts and cost only, never message text.
DO $$ BEGIN
  EXECUTE format('GRANT aicp_migrator TO %I WITH INHERIT FALSE, SET TRUE', session_user);
END $$;

SET ROLE aicp_migrator;

CREATE TABLE aicp.model_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text NOT NULL REFERENCES aicp.workspaces(workspace_id) ON DELETE CASCADE,
  conversation_id text CHECK (conversation_id IS NULL OR char_length(conversation_id) <= 128),
  provider_id text NOT NULL CHECK (char_length(provider_id) BETWEEN 1 AND 64),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 256),
  operation text NOT NULL CHECK (operation IN ('answerability', 'grounded_answer')),
  -- reserved = call about to be made, cost is the worst case; settled = provider usage recorded; failed = no usage seen, worst case kept.
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'failed')),
  -- null tokens = no usage reported by the provider (or call not finished); never estimated.
  input_tokens integer CHECK (input_tokens >= 0),
  output_tokens integer CHECK (output_tokens >= 0),
  total_tokens integer CHECK (total_tokens >= 0),
  CHECK ((input_tokens IS NULL AND output_tokens IS NULL AND total_tokens IS NULL)
      OR (input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND total_tokens = input_tokens + output_tokens)),
  estimated_cost_micros bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_micros >= 0),
  usage_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_usage_workspace_day ON aicp.model_usage (workspace_id, usage_day);

ALTER TABLE aicp.model_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE aicp.model_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY model_usage_workspace_isolation ON aicp.model_usage
  USING (workspace_id = current_setting('app.workspace_id', true))
  WITH CHECK (workspace_id = current_setting('app.workspace_id', true));

GRANT SELECT, INSERT ON aicp.model_usage TO knowledge_runtime;
GRANT UPDATE (status, input_tokens, output_tokens, total_tokens, estimated_cost_micros, updated_at) ON aicp.model_usage TO knowledge_runtime;
GRANT USAGE ON SCHEMA aicp TO knowledge_runtime;

RESET ROLE;
DO $$ BEGIN
  EXECUTE format('REVOKE SET OPTION FOR aicp_migrator FROM %I', session_user);
END $$;
