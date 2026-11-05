import { PgPostgresDatabase } from "../adapters/persistence/postgres/pg-database.js";
import { HandoffService } from "./handoff-service.js";
import { knowledgeDatabaseTls, requiredKnowledgeDatabaseUrl } from "./knowledge-database-url.js";
import type { MerchantIdentity } from "../modules/tenancy/merchant-identity.js";
import type { PostgresDatabasePort } from "../adapters/persistence/postgres/knowledge-repository.js";

type SharedDatabase = typeof globalThis & { __merchantKnowledgeDatabase?: PostgresDatabasePort & { assertLeastPrivilege(): Promise<void> } };

/** Uses the verified session identity; HandoffService revalidates active membership inside every transaction. */
export async function createMerchantHandoffHost(identity: MerchantIdentity) {
  const shared = globalThis as SharedDatabase;
  let database = shared.__merchantKnowledgeDatabase;
  if (!database) {
    const created = new PgPostgresDatabase(requiredKnowledgeDatabaseUrl(), undefined, knowledgeDatabaseTls());
    database = created;
    shared.__merchantKnowledgeDatabase = created;
  }
  await database.assertLeastPrivilege();
  return Object.freeze({ identity, service: new HandoffService(database) });
}
