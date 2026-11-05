import type { KnowledgeCitation } from "../../../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../../../contracts/tenancy/index.js";
import type { PostgresDatabasePort, PostgresRow } from "./knowledge-repository.js";

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_ALIASES = 100;

function parseAliases(value: unknown): readonly (readonly [string, string])[] {
  try {
    if (!Array.isArray(value) || value.length > MAX_ALIASES) return Object.freeze([]);
    const aliases: Array<readonly [string, string]> = [];
    for (const pair of value) {
      if (!Array.isArray(pair) || pair.length !== 2
        || typeof pair[0] !== "string" || typeof pair[1] !== "string"
        || pair[0].trim().length === 0 || pair[1].trim().length === 0
        || pair[0].length > 120 || pair[1].length > 120) return Object.freeze([]);
      aliases.push(Object.freeze([pair[0], pair[1]] as const));
    }
    return Object.freeze(aliases);
  } catch {
    return Object.freeze([]);
  }
}

/** Read-only, parameterized access to public web connection configuration. */
export class PostgresWebChatConfiguration {
  constructor(private readonly database: PostgresDatabasePort) {}

  async resolveConnection(connectionId: string, channel: "web"): Promise<TrustedWorkspaceContext | null> {
    if (typeof connectionId !== "string" || !idPattern.test(connectionId)) return null;
    return this.database.transaction(async (query) => {
      const result = await query.query<PostgresRow & { workspace_id: string; connection_id: string; channel: string }>(
        `SELECT connection.workspace_id, connection.connection_id, connection.channel
         FROM aicp.workspace_connections AS connection
         JOIN aicp.workspaces AS workspace USING (workspace_id)
         WHERE connection.connection_id = $1 AND connection.channel = $2
           AND connection.status = 'active' AND workspace.status = 'active'
         LIMIT 1`,
        [connectionId, channel],
      );
      const row = result.rows[0];
      if (!row || !idPattern.test(row.workspace_id) || !idPattern.test(row.connection_id) || row.channel !== "web") return null;
      return Object.freeze({ workspaceId: row.workspace_id, connectionId: row.connection_id, channel: "web" as const });
    });
  }

  async allowedOrigins(workspace: TrustedWorkspaceContext): Promise<readonly string[]> {
    return this.database.transaction(async (query) => {
      const result = await query.query<PostgresRow & { allowed_origins: unknown }>(
        `SELECT connection.allowed_origins
         FROM aicp.workspace_connections AS connection
         JOIN aicp.workspaces AS workspace USING (workspace_id)
         WHERE connection.workspace_id = $1 AND connection.connection_id = $2
           AND connection.channel = 'web' AND connection.status = 'active' AND workspace.status = 'active'
         LIMIT 1`,
        [workspace.workspaceId, workspace.connectionId],
      );
      const origins = result.rows[0]?.allowed_origins;
      if (!Array.isArray(origins) || origins.some((origin) => typeof origin !== "string")) return Object.freeze([]);
      return Object.freeze([...origins]);
    });
  }

  async queryAliases(workspace: TrustedWorkspaceContext): Promise<readonly (readonly [string, string])[]> {
    return this.database.transaction(async (query) => {
      const result = await query.query<PostgresRow & { query_aliases: unknown }>(
        `SELECT query_aliases FROM aicp.workspaces WHERE workspace_id = $1 AND status = 'active' LIMIT 1`,
        [workspace.workspaceId],
      );
      return parseAliases(result.rows[0]?.query_aliases);
    });
  }

  async describeCitation(workspace: TrustedWorkspaceContext, citation: KnowledgeCitation): Promise<Readonly<{ title: string }> | null> {
    if (citation.workspaceId !== workspace.workspaceId || !idPattern.test(citation.sourceId) || !idPattern.test(citation.sourceVersionId)) return null;
    return this.database.transaction(async (query) => {
      await query.query("SELECT set_config('app.workspace_id', $1, true)", [workspace.workspaceId]);
      const result = await query.query<PostgresRow & { title: string }>(
        `SELECT version.title
         FROM aicp.knowledge_versions AS version
         JOIN aicp.knowledge_sources AS source
           ON source.workspace_id = version.workspace_id AND source.source_id = version.source_id
         WHERE version.workspace_id = $1 AND version.source_id = $2 AND version.version_id = $3
           AND version.status = 'approved' AND version.visibility = 'customer' AND source.status = 'active'
         LIMIT 1`,
        [workspace.workspaceId, citation.sourceId, citation.sourceVersionId],
      );
      const title = result.rows[0]?.title;
      return typeof title === "string" && title.trim() ? Object.freeze({ title }) : null;
    });
  }
}
