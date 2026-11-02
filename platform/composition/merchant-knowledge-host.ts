import "server-only";
import { LocalKnowledgeDocumentExtractor } from "../adapters/knowledge/document-extractor.js";
import { PgPostgresDatabase } from "../adapters/persistence/postgres/pg-database.js";
import { PostgresKnowledgeRepository } from "../adapters/persistence/postgres/knowledge-repository.js";
import { PostgresKnowledgeIntakeAudit } from "../adapters/persistence/postgres/knowledge-intake-audit.js";
import { SupabasePrivateKnowledgeStorage } from "../adapters/storage/supabase/private-knowledge-storage.js";
import { createSupabaseAdminClient } from "../apps/merchant-console/lib/supabase/admin.js";
import { knowledgeDatabaseTls, requiredKnowledgeDatabaseUrl } from "./knowledge-database-url.js";

type HostGlobal = typeof globalThis & { __merchantKnowledgeDatabase?: PgPostgresDatabase };

/** actorUserId must come from the verified session; every knowledge write re-checks it in its transaction. */
export async function createMerchantKnowledgeHost(actorUserId: string) {
  const shared = globalThis as HostGlobal;
  const database = shared.__merchantKnowledgeDatabase ?? new PgPostgresDatabase(requiredKnowledgeDatabaseUrl(), undefined, knowledgeDatabaseTls());
  shared.__merchantKnowledgeDatabase = database;
  await database.assertLeastPrivilege();
  return Object.freeze({
    repository: new PostgresKnowledgeRepository(database, actorUserId),
    intakeAudit: new PostgresKnowledgeIntakeAudit(database, actorUserId),
    extractor: new LocalKnowledgeDocumentExtractor(),
    storage: new SupabasePrivateKnowledgeStorage(createSupabaseAdminClient()),
  });
}
