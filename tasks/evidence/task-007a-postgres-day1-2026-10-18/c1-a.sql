BEGIN;
SELECT pg_backend_pid() AS session_a_pid, current_user, current_setting('app.workspace_id', true) AS initial_workspace;
SELECT set_config('app.workspace_id', 'ws_a', true);
UPDATE knowledge_versions SET status='approved', approved_at=now(), approved_by='staff-a' WHERE workspace_id='ws_a' AND source_id='race-approve' AND version_id='v1';
SELECT pg_sleep(6);
COMMIT;
