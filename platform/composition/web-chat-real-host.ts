import "server-only";
import { createExtractiveAnswerabilityPort } from "../adapters/answers/extractive/extractive-answerability-port.js";
import { PostgresWebChatConfiguration } from "../adapters/persistence/postgres/web-chat-configuration.js";
import { PgPostgresDatabase } from "../adapters/persistence/postgres/pg-database.js";
import { PostgresKnowledgeRepository } from "../adapters/persistence/postgres/knowledge-repository.js";
import { PostgresConversationRepository } from "../adapters/persistence/postgres/conversation-repository.js";
import { PostgresSupportHandoff } from "../adapters/persistence/postgres/support-handoff.js";
import { KnowledgeRetriever, areKnowledgeCitationsCurrent } from "../modules/knowledge/index.js";
import type { PostgresDatabasePort } from "../adapters/persistence/postgres/knowledge-repository.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import { createWebChatHost } from "./web-chat-host.js";
import { knowledgeDatabaseTls, requiredKnowledgeDatabaseUrl } from "./knowledge-database-url.js";

type RuntimeDatabase = PostgresDatabasePort & Readonly<{ assertLeastPrivilege(): Promise<void> }>;
type HostGlobal = typeof globalThis & {
  __merchantKnowledgeDatabase?: RuntimeDatabase;
};

function runtimeDatabase(): RuntimeDatabase {
  const shared = globalThis as HostGlobal;
  if (!shared.__merchantKnowledgeDatabase) {
    shared.__merchantKnowledgeDatabase = new PgPostgresDatabase(
      requiredKnowledgeDatabaseUrl(), undefined, knowledgeDatabaseTls(),
    );
  }
  return shared.__merchantKnowledgeDatabase;
}
/** Real read-only PostgreSQL knowledge/config host. Optional DB injection is for PGlite route integration tests. */
export async function createWebChatRealHost(database: RuntimeDatabase = runtimeDatabase()) {
  await database.assertLeastPrivilege();
  const configuration = new PostgresWebChatConfiguration(database);
  // Empty actor id makes every repository write fail closed; this host only reads approved knowledge.
  const repository = new PostgresKnowledgeRepository(database, "");
  const conversations = new PostgresConversationRepository(database);

  const host = createWebChatHost({
    conversations,
    retrieval: new KnowledgeRetriever(repository),
    evidenceFreshness: {
      areCurrentAndApproved: (workspace, citations, audience) =>
        areKnowledgeCitationsCurrent(repository, workspace, citations, audience),
    },
    answerability: createExtractiveAnswerabilityPort(),
    handoff: new PostgresSupportHandoff(database),
    queryAliases: (workspace) => configuration.queryAliases(workspace),
  });

  return Object.freeze({
    ...host,
    resolveConnection: (connectionId: string, channel: "web") => configuration.resolveConnection(connectionId, channel),
    allowedOrigins: (workspace: Parameters<typeof configuration.allowedOrigins>[0]) => configuration.allowedOrigins(workspace),
    describeCitation: (workspace: Parameters<typeof configuration.describeCitation>[0], citation: Parameters<typeof configuration.describeCitation>[1]) =>
      configuration.describeCitation(workspace, citation),
  });
}
