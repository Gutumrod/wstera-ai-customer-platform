BEGIN;
SELECT pg_backend_pid() AS session_b_pid, current_user;
SELECT set_config('app.workspace_id', 'ws_a', true);
INSERT INTO knowledge_chunks (workspace_id, source_id, version_id, chunk_id, chunk_index, text, locator_kind, locator_chunk_index, locator_position, start_offset, end_offset) VALUES ('ws_a', 'race-approve', 'v1', 'race-approve:v1:late', 1, 'Late', 'span', 1, NULL, 18, 22);
COMMIT;
