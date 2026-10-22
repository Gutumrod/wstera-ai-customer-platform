import { Pool } from "pg";
import type { PostgresDatabasePort, PostgresQueryPort, PostgresRow } from "./knowledge-repository.js";

export interface StructuredLogger {
  error(event: string, fields: Readonly<Record<string, string | number | boolean | undefined>>): void;
}

const safeLogger: StructuredLogger = {
  error(event, fields) {
    process.stderr.write(`${JSON.stringify({ level: "error", event, ...fields })}\n`);
  },
};

/** Direct PostgreSQL adapter pinned to one client for each explicit transaction. */
export class PgPostgresDatabase implements PostgresDatabasePort {
  private readonly pool: Pool;

  constructor(connectionString: string, private readonly logger: StructuredLogger = safeLogger) {
    if (!connectionString.startsWith("postgres://") && !connectionString.startsWith("postgresql://")) {
      throw new Error("INVALID_DATABASE_URL");
    }
    this.pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
    this.pool.on("error", (error: Error) => this.logger.error("postgres.pool_error", { name: error.name }));
  }

  async assertLeastPrivilege(): Promise<void> {
    const result = await this.pool.query<{
      role_name: string;
      is_superuser: boolean;
      bypasses_rls: boolean;
      can_create_db: boolean;
      can_create_role: boolean;
      can_replicate: boolean;
      inherits_privileges: boolean;
      has_memberships: boolean;
    }>("SELECT role.rolname AS role_name, role.rolsuper AS is_superuser, role.rolbypassrls AS bypasses_rls, "
      + "role.rolcreatedb AS can_create_db, role.rolcreaterole AS can_create_role, "
      + "role.rolreplication AS can_replicate, role.rolinherit AS inherits_privileges, "
      + "EXISTS (SELECT 1 FROM pg_auth_members AS membership WHERE membership.member = role.oid) AS has_memberships "
      + "FROM pg_roles AS role WHERE role.rolname = current_user");
    const role = result.rows[0];
    if (!role || role.is_superuser || role.bypasses_rls || role.can_create_db || role.can_create_role
      || role.can_replicate || role.inherits_privileges || role.has_memberships || role.role_name !== "knowledge_runtime") {
      this.logger.error("postgres.runtime_role_rejected", {
        role: role?.role_name ?? "unknown",
        isSuperuser: role?.is_superuser ?? true,
        bypassesRls: role?.bypasses_rls ?? true,
        canCreateDb: role?.can_create_db ?? true,
        canCreateRole: role?.can_create_role ?? true,
        canReplicate: role?.can_replicate ?? true,
        hasMemberships: role?.has_memberships ?? true,
      });
      throw new Error("UNSAFE_POSTGRES_RUNTIME_ROLE");
    }
  }

  async transaction<T>(operation: (query: PostgresQueryPort) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const queryPort: PostgresQueryPort = {
        async query<Row extends PostgresRow = PostgresRow>(sql: string, values: readonly unknown[] = []) {
          const result = await client.query<Row>(sql, [...values]);
          return { rows: result.rows };
        },
      };
      const value = await operation(queryPort);
      await client.query("COMMIT");
      return value;
    } catch (error: unknown) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError: unknown) {
        this.logger.error("postgres.rollback_failed", {
          name: rollbackError instanceof Error ? rollbackError.name : "UnknownError",
        });
      }
      this.logger.error("postgres.transaction_failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: typeof error === "object" && error !== null && "code" in error
          && typeof error.code === "string" ? error.code : undefined,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
