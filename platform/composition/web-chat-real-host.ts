import "server-only";
import { createExtractiveAnswerabilityPort } from "../adapters/answers/extractive/extractive-answerability-port.js";
import { PostgresWebChatConfiguration } from "../adapters/persistence/postgres/web-chat-configuration.js";
import { PgPostgresDatabase } from "../adapters/persistence/postgres/pg-database.js";
import { PostgresKnowledgeRepository } from "../adapters/persistence/postgres/knowledge-repository.js";
import { PostgresConversationRepository } from "../adapters/persistence/postgres/conversation-repository.js";
import { PostgresSupportHandoff } from "../adapters/persistence/postgres/support-handoff.js";
import { PostgresConversationMessages } from "../adapters/persistence/postgres/conversation-messages.js";
import { KnowledgeRetriever, areKnowledgeCitationsCurrent, listBroadCustomerKnowledge } from "../modules/knowledge/index.js";
import type { PostgresDatabasePort } from "../adapters/persistence/postgres/knowledge-repository.js";
import type { TrustedWorkspaceContext } from "../contracts/tenancy/index.js";
import { PostgresModelSpendLedger } from "../adapters/persistence/postgres/model-usage.js";
import { createWebChatHost } from "./web-chat-host.js";
import { createModelGate, createModelPathFactory, readModelPathSettings } from "./model-path.js";
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
export async function createWebChatRealHost(
  database: RuntimeDatabase = runtimeDatabase(),
  modelPath: Readonly<{ env?: Readonly<Record<string, string | undefined>>; fetch?: typeof fetch; log?: Parameters<typeof readModelPathSettings>[1] }> = {},
) {
  await database.assertLeastPrivilege();
  const configuration = new PostgresWebChatConfiguration(database);
  // Empty actor id makes every repository write fail closed; this host only reads approved knowledge.
  const repository = new PostgresKnowledgeRepository(database, "");
  const conversations = new PostgresConversationRepository(database);

  // Off unless AICP_MODEL_ANSWERS_ENABLED=true and every model setting is valid; answers then stay extractive.
  const modelSettings = readModelPathSettings(modelPath.env ?? process.env, modelPath.log);
  const ledger = new PostgresModelSpendLedger(database);
  const host = createWebChatHost({
    ...(modelSettings ? {
      model: {
        enabled: true,
        createModelPort: createModelPathFactory({
          settings: modelSettings,
          ledger: new PostgresModelSpendLedger(database),
          ...(modelPath.fetch ? { fetch: modelPath.fetch } : {}),
          ...(modelPath.log ? { log: modelPath.log } : {}),
        }),
      },
      modelGate: createModelGate({ settings: modelSettings, ledger,
        ...(modelPath.fetch ? { fetch: modelPath.fetch } : {}), ...(modelPath.log ? { log: modelPath.log } : {}) }),
      broadRetrieval: (workspace) => listBroadCustomerKnowledge(repository, workspace),
    } : {}),
    conversations,
    retrieval: new KnowledgeRetriever(repository),
    evidenceFreshness: {
      areCurrentAndApproved: (workspace, citations, audience) =>
        areKnowledgeCitationsCurrent(repository, workspace, citations, audience),
    },
    answerability: createExtractiveAnswerabilityPort(),
    handoff: new PostgresSupportHandoff(database),
    messages: new PostgresConversationMessages(database),
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
