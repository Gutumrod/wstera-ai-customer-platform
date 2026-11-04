import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { PostgresDatabasePort, PostgresQueryPort, PostgresRow } from "./knowledge-repository.js";
import { NO_ACTOR_FOR_SCHEMA_TESTS, PostgresKnowledgeRepository } from "./knowledge-repository.js";
import type {
  KnowledgeCitation,
  KnowledgeRepositoryPort,
  KnowledgeVersionDraft,
} from "../../../contracts/data/knowledge.js";
import { createFaqVersion, retrieveKnowledge } from "../../../modules/knowledge/index.js";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";

const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
const shopB = createTrustedWorkspace({ workspaceId: "shop-b", connectionId: "web-b", channel: "web" });
const basePath = resolve(process.cwd(), "platform/adapters/persistence/postgres/migrations/001-knowledge.sql");
const visibilityPath = resolve(process.cwd(), "supabase/migrations/20261104000100_knowledge_visibility.sql");

const INTERNAL_TEXT = "รหัสลับภายใน INTERNAL-X1";
const CUSTOMER_TEXT = "จัดส่งภายใน 2 วันทำการ";

function databasePort(database: PGlite): PostgresDatabasePort {
  return {
    async transaction<T>(operation: (query: PostgresQueryPort) => Promise<T>): Promise<T> {
      return database.transaction(async (transaction) => {
        await transaction.exec("SET LOCAL ROLE knowledge_runtime");
        return operation({
          async query<Row extends PostgresRow = PostgresRow>(sql: string, values: readonly unknown[] = []) {
            return { rows: (await transaction.query<Row>(sql, [...values])).rows };
          },
        });
      });
    },
  };
}

async function createRepository() {
  const database = new PGlite();
  await database.exec("CREATE ROLE knowledge_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;");
  await database.exec(await readFile(basePath, "utf8"));
  await database.exec(await readFile(visibilityPath, "utf8"));
  await database.exec(`
    GRANT USAGE ON SCHEMA aicp TO knowledge_runtime;
    GRANT SELECT ON aicp.knowledge_sources TO knowledge_runtime;
    GRANT INSERT (workspace_id, source_id, kind, title, created_at) ON aicp.knowledge_sources TO knowledge_runtime;
    GRANT UPDATE (status) ON aicp.knowledge_sources TO knowledge_runtime;
    GRANT SELECT ON aicp.knowledge_versions TO knowledge_runtime;
    GRANT INSERT (workspace_id, source_id, version_id, kind, title, content, created_at) ON aicp.knowledge_versions TO knowledge_runtime;
    GRANT UPDATE (status, approved_at, approved_by, revoked_at, revoked_by, revocation_reason) ON aicp.knowledge_versions TO knowledge_runtime;
    GRANT SELECT, INSERT ON aicp.knowledge_chunks TO knowledge_runtime;
  `);
  return { database, repository: new PostgresKnowledgeRepository(databasePort(database), NO_ACTOR_FOR_SCHEMA_TESTS) };
}

async function addApprovedFaq(
  repository: PostgresKnowledgeRepository,
  input: Readonly<{ sourceId: string; content: string; visibility?: "internal" | "customer" }>,
) {
  const version = createFaqVersion({
    workspace: shopA,
    sourceId: input.sourceId,
    versionId: "v1",
    title: input.sourceId,
    content: input.content,
    ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
  } as never);
  await repository.createSource(shopA, { sourceId: input.sourceId, title: input.sourceId, kind: "faq" });
  await repository.createVersion(shopA, version as KnowledgeVersionDraft);
  await repository.transitionVersion(shopA, input.sourceId, "v1", "validating");
  await repository.transitionVersion(shopA, input.sourceId, "v1", "extracting");
  await repository.transitionVersion(shopA, input.sourceId, "v1", "indexed");
  await repository.approveVersion(shopA, input.sourceId, "v1", { approvedBy: "staff-1" });
  return version;
}

/** Loose calls keep this file compilable against the pre-visibility contract for the "before" run. */
type LooseRow = Readonly<{ source: Readonly<Record<string, unknown>>; version: Readonly<Record<string, unknown>>; chunk: Readonly<Record<string, unknown>> }>;
function listChunks(repository: unknown, workspace: unknown, shortlist: unknown, audience: unknown): Promise<readonly LooseRow[]> {
  return (repository as { listRetrievableChunks: (...args: unknown[]) => Promise<readonly LooseRow[]> })
    .listRetrievableChunks(workspace, shortlist, audience);
}
function isCurrent(repository: unknown, workspace: unknown, citation: unknown, audience: unknown): Promise<boolean> {
  return (repository as { isCurrentCitation: (...args: unknown[]) => Promise<boolean> })
    .isCurrentCitation(workspace, citation, audience);
}
function areCurrent(repository: unknown, workspace: unknown, citations: readonly unknown[], audience: unknown): Promise<boolean> {
  return (repository as { areCurrentCitations: (...args: unknown[]) => Promise<boolean> })
    .areCurrentCitations(workspace, citations, audience);
}
const citationOf = (row: LooseRow): KnowledgeCitation => Object.freeze({
  workspaceId: shopA.workspaceId,
  sourceId: String(row.source.sourceId),
  sourceVersionId: String(row.version.versionId),
  chunkId: String(row.chunk.chunkId),
  locator: row.chunk.locator as KnowledgeCitation["locator"],
});

test("PostgreSQL retrieval filters visibility in SQL for customer and staff audiences", async () => {
  const { database, repository } = await createRepository();
  try {
    await addApprovedFaq(repository, { sourceId: "internal-faq", content: INTERNAL_TEXT, visibility: "internal" });
    await addApprovedFaq(repository, { sourceId: "customer-faq", content: CUSTOMER_TEXT, visibility: "customer" });

    const customerRows = await listChunks(repository, shopA, undefined, "customer");
    assert.deepEqual(customerRows.map((row) => row.source.sourceId).sort(), ["customer-faq"],
      "SQL must not return an internal version to a customer audience");
    const staffRows = await listChunks(repository, shopA, undefined, "staff");
    assert.deepEqual(staffRows.map((row) => row.source.sourceId).sort(), ["customer-faq", "internal-faq"]);

    // Shortlist path must apply the same predicate.
    const shortlisted = await listChunks(repository, shopA, { terms: ["internal-x1"], skuKeys: [] }, "customer");
    assert.deepEqual(shortlisted, []);

    const customerAnswer = await retrieveKnowledge(repository, {
      workspace: shopA, query: "INTERNAL-X1", limit: 3, audience: "customer",
    } as never);
    assert.deepEqual(customerAnswer, { kind: "no_answer", reason: "NO_APPROVED_EVIDENCE" });
    const staffAnswer = await retrieveKnowledge(repository, {
      workspace: shopA, query: "INTERNAL-X1", limit: 3, audience: "staff",
    } as never);
    assert.equal(staffAnswer.kind, "evidence");
    assert.deepEqual(staffAnswer.kind === "evidence" ? staffAnswer.hits.map((hit) => hit.sourceId) : [], ["internal-faq"]);
  } finally {
    await database.close();
  }
});

test("PostgreSQL citation freshness honours the audience and keeps cross-workspace denial", async () => {
  const { database, repository } = await createRepository();
  try {
    await addApprovedFaq(repository, { sourceId: "internal-faq", content: INTERNAL_TEXT, visibility: "internal" });
    const staffRows = await listChunks(repository, shopA, undefined, "staff");
    const citation = citationOf(staffRows[0]!);

    assert.equal(await isCurrent(repository, shopA, citation, "customer"), false,
      "an internal citation must not be reported current for a customer audience");
    assert.equal(await areCurrent(repository, shopA, [citation], "customer"), false);
    assert.equal(await isCurrent(repository, shopA, citation, "staff"), true);
    assert.equal(await areCurrent(repository, shopA, [citation], "staff"), true);
    assert.equal(await isCurrent(repository, shopB, citation, "staff"), false, "cross-workspace citations stay rejected");
  } finally {
    await database.close();
  }
});

test("PostgreSQL persists a version with no explicit visibility as internal", async () => {
  const { database, repository } = await createRepository();
  try {
    await addApprovedFaq(repository, { sourceId: "default-faq", content: INTERNAL_TEXT });
    const persisted = await repository.getVersion(shopA, "default-faq", "v1");
    assert.equal((persisted as unknown as Record<string, unknown>).visibility, "internal");
    assert.deepEqual((await listChunks(repository, shopA, undefined, "customer")).map((row) => row.source.sourceId), []);
  } finally {
    await database.close();
  }
});

test("PostgreSQL refuses every UPDATE of visibility", async (t) => {
  const { database, repository } = await createRepository();
  try {
    await addApprovedFaq(repository, { sourceId: "immutable-faq", content: INTERNAL_TEXT, visibility: "internal" });

    await t.test("the runtime role has no UPDATE privilege on visibility", async () => {
      await assert.rejects(database.transaction(async (transaction) => {
        await transaction.exec("SET LOCAL ROLE knowledge_runtime");
        await transaction.query("SELECT set_config('app.workspace_id', $1, true)", [shopA.workspaceId]);
        await transaction.query("UPDATE aicp.knowledge_versions SET visibility = 'customer' WHERE workspace_id = $1", [shopA.workspaceId]);
      }), (error: unknown) => {
        assert.equal((error as { code?: string }).code, "42501");
        return true;
      });
    });

    await t.test("the immutability trigger blocks an elevated writer", async () => {
      await assert.rejects(
        database.query("UPDATE aicp.knowledge_versions SET visibility = 'customer' WHERE workspace_id = $1", [shopA.workspaceId]),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, "23514");
          assert.match((error as { message?: string }).message ?? "", /visibility is immutable/);
          return true;
        },
      );
    });

    const persisted = await repository.getVersion(shopA, "immutable-faq", "v1");
    assert.equal((persisted as unknown as Record<string, unknown>).visibility, "internal");
  } finally {
    await database.close();
  }
});
