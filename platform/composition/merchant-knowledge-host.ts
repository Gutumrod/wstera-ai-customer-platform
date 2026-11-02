import "server-only";
import { LocalKnowledgeDocumentExtractor } from "../adapters/knowledge/document-extractor.js";
import { PgPostgresDatabase } from "../adapters/persistence/postgres/pg-database.js";
import { PostgresKnowledgeRepository } from "../adapters/persistence/postgres/knowledge-repository.js";
import { PostgresKnowledgeIntakeAudit } from "../adapters/persistence/postgres/knowledge-intake-audit.js";
import { SupabasePrivateKnowledgeStorage } from "../adapters/storage/supabase/private-knowledge-storage.js";
import { createSupabaseAdminClient } from "../apps/merchant-console/lib/supabase/admin.js";
import { requiredKnowledgeDatabaseUrl } from "./knowledge-database-url.js";

type HostGlobal = typeof globalThis & { __merchantKnowledgeDatabase?: PgPostgresDatabase };

export async function createMerchantKnowledgeHost() {
  const shared = globalThis as HostGlobal;
  const database = shared.__merchantKnowledgeDatabase ?? new PgPostgresDatabase(requiredKnowledgeDatabaseUrl());
  shared.__merchantKnowledgeDatabase = database;
  await database.assertLeastPrivilege();
  return Object.freeze({
    repository: new PostgresKnowledgeRepository(database),
    intakeAudit: new PostgresKnowledgeIntakeAudit(database),
    extractor: new LocalKnowledgeDocumentExtractor(),
    storage: new SupabasePrivateKnowledgeStorage(createSupabaseAdminClient()),
  });
}
