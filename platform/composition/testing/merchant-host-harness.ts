import { readdir, readFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostgresDatabasePort, PostgresQueryPort, PostgresRow } from "../../adapters/persistence/postgres/knowledge-repository.js";
import { SupabaseKnowledgeApproval } from "../../adapters/persistence/supabase/knowledge-approval.js";
import type { KnowledgeObjectStoragePort } from "../../contracts/data/knowledge-storage.js";
import type { ActiveMerchantBinding, MerchantMembershipRepositoryPort } from "../../contracts/tenancy/merchant.js";
import type { KnowledgeHostContext } from "../../apps/merchant-console/lib/knowledge-routes.js";
import { MerchantIdentityError, resolveMerchantIdentity } from "../../modules/tenancy/merchant-identity.js";

export const OWNER_A = "00000000-0000-0000-0000-00000000000a";
export const STAFF_A = "00000000-0000-0000-0000-00000000000b";
export const OWNER_B = "00000000-0000-0000-0000-00000000000c";
export const APP_ORIGIN = "http://127.0.0.1:3000";

const authBootstrap = `
  CREATE ROLE authenticated NOLOGIN;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (
    id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL,
    file_size_limit bigint NOT NULL, allowed_mime_types text[]
  );
`;

const seed = `
  INSERT INTO auth.users (id) VALUES ('${OWNER_A}'), ('${STAFF_A}'), ('${OWNER_B}');
  INSERT INTO aicp.workspaces (workspace_id, name) VALUES ('shop-a', 'Shop A'), ('shop-b', 'Shop B');
  INSERT INTO aicp.workspace_memberships (workspace_id, user_id, role) VALUES
    ('shop-a', '${OWNER_A}', 'owner'), ('shop-a', '${STAFF_A}', 'staff'), ('shop-b', '${OWNER_B}', 'owner');
  INSERT INTO aicp.workspace_connections (workspace_id, connection_id, channel) VALUES
    ('shop-a', 'web-a', 'web'), ('shop-a', 'line-a', 'line'), ('shop-b', 'web-b', 'web');
`;

/** Every product migration, in order, on an in-process database with the Supabase auth surface stubbed. */
export async function createMigratedDatabase(): Promise<PGlite> {
  const database = new PGlite();
  await database.exec(authBootstrap);
  const directory = resolve(process.cwd(), "supabase/migrations");
  for (const file of (await readdir(directory)).sort()) await database.exec(await readFile(resolve(directory, file), "utf8"));
  await database.exec(seed);
  return database;
}

/** Runs each transaction as the real runtime role, as the pooled pg adapter does in production. */
export function runtimePort(database: PGlite, statements?: string[]): PostgresDatabasePort {
  return {
    async transaction<T>(operation: (query: PostgresQueryPort) => Promise<T>): Promise<T> {
      return database.transaction(async (transaction) => {
        await transaction.exec("SET LOCAL ROLE knowledge_runtime");
        return operation({
          async query<Row extends PostgresRow = PostgresRow>(sql: string, values: readonly unknown[] = []) {
            statements?.push(sql);
            return { rows: (await transaction.query<Row>(sql, [...values])).rows };
          },
        });
      });
    },
  };
}

export async function asAuthenticated<T>(database: PGlite, userId: string | null, operation: (query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>) => Promise<T>): Promise<T> {
  return database.transaction(async (transaction) => {
    await transaction.exec("SET LOCAL ROLE authenticated");
    await transaction.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    return operation((sql, values = []) => transaction.query(sql, values));
  });
}

/** The PostgREST call shape used by SupabaseKnowledgeApproval, backed by the real SQL function. */
export function authenticatedRpcClient(database: PGlite, userId: string | null): SupabaseClient {
  return {
    schema: () => ({
      async rpc(name: string, args: Record<string, unknown>) {
        try {
          await asAuthenticated(database, userId, (query) => query(
            `SELECT aicp.${name}($1, $2, $3)`,
            [args.target_workspace_id, args.target_source_id, args.target_version_id],
          ));
          return { data: null, error: null };
        } catch (error: unknown) {
          const { code, message } = error as { code?: string; message?: string };
          return { data: null, error: { code, message } };
        }
      },
    }),
  } as unknown as SupabaseClient;
}

export type HostHarness = Awaited<ReturnType<typeof createHostHarness>>;

/**
 * Real migrations, RLS, identity resolver and host wiring. Only two edges are fake and they are the
 * ones no test may reach: Supabase Auth (session is set directly) and object storage (an in-memory map).
 */
export async function createHostHarness() {
  register("data:text/javascript,export async function resolve(specifier, context, nextResolve) { if (specifier === 'server-only') return { url: 'data:text/javascript,', shortCircuit: true }; return nextResolve(specifier, context); }", import.meta.url);
  Object.assign(process.env, {
    APP_ENV: "local",
    NEXT_PUBLIC_APP_ENV: "local",
    NEXT_PUBLIC_APP_URL: APP_ORIGIN,
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SECRET_KEY: "synthetic",
  });
  const { createMerchantKnowledgeHost } = await import("../merchant-knowledge-host.js");
  const database = await createMigratedDatabase();
  (globalThis as { __merchantKnowledgeDatabase?: unknown }).__merchantKnowledgeDatabase = {
    ...runtimePort(database),
    async assertLeastPrivilege() { /* the pooled role check needs a real login role */ },
  };

  const objects = new Map<string, Uint8Array>();
  const storage: KnowledgeObjectStoragePort = {
    async putOriginal(workspace, identity, bytes) {
      const path = `${workspace.workspaceId}/${identity.sourceId}/${identity.versionId}/${identity.filename}`;
      const created = !objects.has(path);
      objects.set(path, bytes.slice());
      return Object.freeze({ path, created });
    },
    async removeOriginal(_workspace, path) { objects.delete(path); },
  };
  const memberships: MerchantMembershipRepositoryPort = {
    async listActiveBindings(userId) {
      return asAuthenticated(database, userId, async (query) => {
        const { rows } = await query(
          `SELECT membership.workspace_id, membership.role, connection.connection_id, connection.channel
           FROM aicp.workspace_memberships AS membership
           JOIN aicp.workspaces AS workspace USING (workspace_id)
           JOIN aicp.workspace_connections AS connection USING (workspace_id)
           WHERE membership.user_id = $1 AND membership.status = 'active' AND workspace.status = 'active'
             AND connection.channel = 'web' AND connection.status = 'active'`,
          [userId],
        );
        return (rows as Array<{ workspace_id: string; role: "owner" | "staff"; connection_id: string; channel: "web" }>).map((row): ActiveMerchantBinding => ({
          workspaceId: row.workspace_id, role: row.role, connectionId: row.connection_id, channel: row.channel,
        }));
      });
    },
  };

  const session: { userId: string | null; afterIdentity?: () => Promise<void> } = { userId: null };
  const requireHost = async (): Promise<KnowledgeHostContext> => {
    if (!session.userId) throw new MerchantIdentityError("UNAUTHENTICATED");
    const identity = await resolveMerchantIdentity(memberships, session.userId);
    const host = await createMerchantKnowledgeHost(identity.userId);
    await session.afterIdentity?.();
    return { ...host, storage, approval: new SupabaseKnowledgeApproval(authenticatedRpcClient(database, session.userId)), identity };
  };

  return {
    database,
    session,
    objects,
    requireHost,
    async rowCounts() {
      const counts: Record<string, number> = {};
      for (const table of ["knowledge_sources", "knowledge_versions", "knowledge_chunks", "knowledge_quarantine_records", "knowledge_original_objects"]) {
        const { rows } = await database.query<{ count: number }>(`SELECT count(*)::int AS count FROM aicp.${table}`);
        counts[table] = rows[0]!.count;
      }
      counts.objects = objects.size;
      return counts;
    },
    async close() {
      delete (globalThis as { __merchantKnowledgeDatabase?: unknown }).__merchantKnowledgeDatabase;
      await database.close();
    },
  };
}
