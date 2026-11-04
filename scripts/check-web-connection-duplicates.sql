-- Read-only pre-check for migration 20261103000100_host_hardening.sql.
-- That migration creates a unique index (one active web connection per workspace) and fails as a whole if
-- duplicates already exist. Run this first against the target database; apply the migration only when it
-- returns no rows. Resolve any rows it lists (disable or remove the extra connections) as a separate approved step.
SELECT workspace_id, count(*) AS active_web_connections, array_agg(connection_id ORDER BY connection_id) AS connection_ids
FROM aicp.workspace_connections
WHERE channel = 'web' AND status = 'active'
GROUP BY workspace_id
HAVING count(*) > 1
ORDER BY workspace_id;
