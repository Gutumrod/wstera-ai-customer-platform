import "server-only";
import { LocalKnowledgeDocumentExtractor } from "../adapters/knowledge/document-extractor.js";
import { PgPostgresDatabase } from "../adapters/persistence/postgres/pg-database.js";
import { PostgresKnowledgeRepository } from "../adapters/persistence/postgres/knowledge-repository.js";
import { PostgresKnowledgeIntakeAudit } from "../adapters/persistence/postgres/knowledge-intake-audit.js";
import { SupabasePrivateKnowledgeStorage } from "../adapters/storage/supabase/private-knowledge-storage.js";
import { createSupabaseAdminClient } from "../apps/merchant-console/lib/supabase/admin.js";

type HostGlobal = typeof globalThis & { __merchantKnowledgeDatabase?: PgPostgresDatabase };

function requiredDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (process.env.APP_ENV !== "local" || !value) throw new Error("LOCAL_DATABASE_URL_REQUIRED");
  const parsed = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || parsed.port !== "54322"
    || decodeURIComponent(parsed.username) !== "knowledge_runtime") {
    throw new Error("LOCAL_KNOWLEDGE_DATABASE_URL_REQUIRED");
  }
  return value;
}

export async function createMerchantKnowledgeHost() {
  const shared = globalThis as HostGlobal;
  const database = shared.__merchantKnowledgeDatabase ?? new PgPostgresDatabase(requiredDatabaseUrl());
  shared.__merchantKnowledgeDatabase = database;
  await database.assertLeastPrivilege();
  return Object.freeze({
    repository: new PostgresKnowledgeRepository(database),
    intakeAudit: new PostgresKnowledgeIntakeAudit(database),
    extractor: new LocalKnowledgeDocumentExtractor(),
    storage: new SupabasePrivateKnowledgeStorage(createSupabaseAdminClient()),
  });
}
