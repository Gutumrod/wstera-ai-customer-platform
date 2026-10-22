SELECT source_id, version_id, status,
       (SELECT count(*) FROM knowledge_chunks c WHERE c.workspace_id=v.workspace_id AND c.source_id=v.source_id AND c.version_id=v.version_id) AS chunk_count
FROM knowledge_versions v
WHERE workspace_id='ws_a' AND source_id IN ('race-approve','race-insert','race-concurrent')
ORDER BY source_id, version_id;
SELECT count(*) AS approved_and_retrievable_versions
FROM knowledge_versions v
WHERE workspace_id='ws_a' AND source_id='race-concurrent' AND status='approved'
  AND EXISTS (SELECT 1 FROM knowledge_chunks c WHERE c.workspace_id=v.workspace_id AND c.source_id=v.source_id AND c.version_id=v.version_id);
SELECT source_id, status FROM knowledge_sources WHERE workspace_id='ws_b' AND source_id='rls-only';
SELECT version_id, status FROM knowledge_versions WHERE workspace_id='ws_b' AND source_id='rls-only';
SELECT count(*) AS forged_rows FROM (
  SELECT source_id AS id FROM knowledge_sources WHERE source_id='forged-source'
  UNION ALL SELECT version_id FROM knowledge_versions WHERE version_id='forged-v'
  UNION ALL SELECT chunk_id FROM knowledge_chunks WHERE chunk_id='forged-chunk'
) forged;
