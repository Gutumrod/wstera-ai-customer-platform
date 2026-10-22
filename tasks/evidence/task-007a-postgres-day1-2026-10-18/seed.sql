INSERT INTO knowledge_sources (workspace_id, source_id, kind, title, created_at) VALUES
  ('ws_a', 'race-approve', 'faq', 'C1', now()),
  ('ws_a', 'race-insert', 'faq', 'C2', now()),
  ('ws_a', 'race-concurrent', 'faq', 'C3', now()),
  ('ws_b', 'rls-only', 'faq', 'Tenant B', now());
INSERT INTO knowledge_versions (workspace_id, source_id, version_id, kind, title, content, status, created_at) VALUES
  ('ws_a', 'race-approve', 'v1', 'faq', 'C1', 'approved immutable', 'indexed', now()),
  ('ws_a', 'race-insert', 'v1', 'faq', 'C2', 'complete chunk', 'indexed', now()),
  ('ws_a', 'race-concurrent', 'v1', 'faq', 'C3 A', 'approval A', 'indexed', now()),
  ('ws_a', 'race-concurrent', 'v2', 'faq', 'C3 B', 'approval B', 'indexed', now()),
  ('ws_b', 'rls-only', 'v1', 'faq', 'Tenant B', 'secret B', 'indexed', now());
INSERT INTO knowledge_chunks (workspace_id, source_id, version_id, chunk_id, chunk_index, text, locator_kind, locator_chunk_index, locator_position, start_offset, end_offset) VALUES
  ('ws_a', 'race-approve', 'v1', 'race-approve:v1:0', 0, 'approved immutable', 'span', 0, NULL, 0, 18),
  ('ws_a', 'race-concurrent', 'v1', 'race-concurrent:v1:0', 0, 'approval A', 'span', 0, NULL, 0, 10),
  ('ws_a', 'race-concurrent', 'v2', 'race-concurrent:v2:0', 0, 'approval B', 'span', 0, NULL, 0, 10),
  ('ws_b', 'rls-only', 'v1', 'rls-only:v1:0', 0, 'secret B', 'span', 0, NULL, 0, 8);
