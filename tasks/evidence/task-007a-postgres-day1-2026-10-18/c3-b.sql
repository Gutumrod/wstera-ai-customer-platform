BEGIN;
SELECT pg_backend_pid() AS session_b_pid, current_user;
SELECT set_config('app.workspace_id', 'ws_a', true);
UPDATE knowledge_versions SET status='approved', approved_at=now(), approved_by='staff-b' WHERE workspace_id='ws_a' AND source_id='race-concurrent' AND version_id='v2';
COMMIT;
