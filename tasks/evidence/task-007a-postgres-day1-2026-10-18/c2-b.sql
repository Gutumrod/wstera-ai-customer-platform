BEGIN;
SELECT pg_backend_pid() AS session_b_pid, current_user;
SELECT set_config('app.workspace_id', 'ws_a', true);
INSERT INTO knowledge_chunks (workspace_id, source_id, version_id, chunk_id, chunk_index, text, locator_kind, locator_chunk_index, locator_position, start_offset, end_offset) VALUES ('ws_a', 'race-insert', 'v1', 'race-insert:v1:0', 0, 'complete chunk', 'span', 0, NULL, 0, 14);
SELECT pg_sleep(6);
COMMIT;
