import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { PostgresDatabasePort, PostgresQueryPort, PostgresRow } from "./knowledge-repository.js";
import { PostgresKnowledgeRepository } from "./knowledge-repository.js";
import { KnowledgeError, createFaqVersion, createImportedKnowledgeVersion } from "../../../modules/knowledge/index.js";
import { createTrustedWorkspace } from "../../../modules/tenancy/workspace.js";

const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
const shopB = createTrustedWorkspace({ workspaceId: "shop-b", connectionId: "web-b", channel: "web" });
const migrationPath = resolve(process.cwd(), "platform/adapters/persistence/postgres/migrations/001-knowledge.sql");

function databasePort(database: PGlite, failOnChunkInsert = false): PostgresDatabasePort {
  return {
    async transaction<T>(operation: (query: PostgresQueryPort) => Promise<T>): Promise<T> {
      return database.transaction(async (transaction) => {
        await transaction.exec("SET LOCAL ROLE knowledge_runtime");
        const queryPort: PostgresQueryPort = {
          async query<Row extends PostgresRow = PostgresRow>(sql: string, values: readonly unknown[] = []) {
            if (failOnChunkInsert && sql.startsWith("INSERT INTO knowledge_chunks")) {
              throw Object.assign(new Error("test injection"), { code: "XX000" });
            }
            const result = await transaction.query<Row>(sql, [...values]);
            return { rows: result.rows };
          },
        };
        return operation(queryPort);
      });
    },
  };
}

async function createRepository() {
  const database = new PGlite();
  await database.exec("CREATE ROLE knowledge_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;");
  const migration = await readFile(migrationPath, "utf8");
  await database.exec(migration);
  await database.exec(`
    GRANT SELECT ON knowledge_sources TO knowledge_runtime;
    GRANT INSERT (workspace_id, source_id, kind, title, created_at) ON knowledge_sources TO knowledge_runtime;
    GRANT UPDATE (status) ON knowledge_sources TO knowledge_runtime;
    GRANT SELECT ON knowledge_versions TO knowledge_runtime;
    GRANT INSERT (workspace_id, source_id, version_id, kind, title, content, created_at) ON knowledge_versions TO knowledge_runtime;
    GRANT UPDATE (status, approved_at, approved_by, revoked_at, revoked_by, revocation_reason) ON knowledge_versions TO knowledge_runtime;
    GRANT SELECT, INSERT ON knowledge_chunks TO knowledge_runtime;
  `);
  return { database, repository: new PostgresKnowledgeRepository(databasePort(database)) };
}

async function addIndexedFaq(repository: PostgresKnowledgeRepository, workspace = shopA, sourceId = "faq", versionId = "v1") {
  const version = createFaqVersion({
    workspace, sourceId, versionId, title: "Shipping", content: "จัดส่งภายใน 2 วันทำการ",
    createdAt: "2026-10-16T00:00:00.000Z",
  });
  await repository.createSource(workspace, { sourceId, title: "Shipping", kind: "faq" });
  await repository.createVersion(workspace, version);
  await repository.transitionVersion(workspace, sourceId, versionId, "validating");
  await repository.transitionVersion(workspace, sourceId, versionId, "extracting");
  await repository.transitionVersion(workspace, sourceId, versionId, "indexed");
  return version;
}

test("PostgreSQL knowledge repository enforces persistence, RLS, lifecycle and citation locators", async (t) => {
  const { database, repository } = await createRepository();
  try {
    await t.test("workspace RLS is default-deny and transaction-local scope does not leak", async () => {
      await repository.createSource(shopA, { sourceId: "same-id", title: "Shop A", kind: "faq" });
      await repository.createSource(shopB, { sourceId: "same-id", title: "Shop B", kind: "faq" });
      assert.equal((await repository.getSource(shopA, "same-id"))?.title, "Shop A");
      assert.equal((await repository.getSource(shopB, "same-id"))?.title, "Shop B");

      const unscoped = await database.transaction(async (transaction) => {
        await transaction.exec("SET LOCAL ROLE knowledge_runtime");
        return transaction.query("SELECT source_id FROM knowledge_sources WHERE source_id = 'same-id'");
      });
      assert.equal(unscoped.rows.length, 0);

      await assert.rejects(databasePort(database).transaction(async (query) => {
        await query.query("SELECT set_config('app.workspace_id', $1, true)", [shopA.workspaceId]);
        await query.query(
          "INSERT INTO knowledge_sources (workspace_id, source_id, kind, title, created_at) VALUES ($1, $2, $3, $4, $5)",
          [shopB.workspaceId, "forged", "faq", "Forged", "2026-10-16T00:00:00.000Z"],
        );
      }), (error: unknown) => {
        assert.equal((error as { code?: string }).code, "42501", "cross-workspace INSERT must fail at RLS, not a grant error");
        return true;
      });
      assert.equal(await repository.getSource(shopB, "forged"), null);

      const forgedRead = await databasePort(database).transaction(async (query) => {
        await query.query("SELECT set_config('app.workspace_id', $1, true)", [shopA.workspaceId]);
        return query.query(
          "SELECT source_id FROM knowledge_sources WHERE workspace_id = $1 AND source_id = $2",
          [shopB.workspaceId, "same-id"],
        );
      });
      assert.equal(forgedRead.rows.length, 0);

      const forgedUpdate = await databasePort(database).transaction(async (query) => {
        await query.query("SELECT set_config('app.workspace_id', $1, true)", [shopA.workspaceId]);
        return query.query(
          "UPDATE knowledge_sources SET status = 'archived' WHERE workspace_id = $1 AND source_id = $2 RETURNING source_id",
          [shopB.workspaceId, "same-id"],
        );
      });
      assert.equal(forgedUpdate.rows.length, 0);
      assert.equal((await repository.getSource(shopB, "same-id"))?.status, "active");
    });

    await t.test("approval is atomic, one approved version is enforced, and revoke removes retrieval eligibility", async () => {
      await addIndexedFaq(repository, shopA, "approval", "v1");
      await addIndexedFaq(repository, shopA, "approval", "v2");
      const outcomes = await Promise.allSettled([
        repository.approveVersion(shopA, "approval", "v1", { approvedBy: "staff-1", approvedAt: "2026-10-16T01:00:00.000Z" }),
        repository.approveVersion(shopA, "approval", "v2", { approvedBy: "staff-1", approvedAt: "2026-10-16T01:00:00.000Z" }),
      ]);
      assert.equal(outcomes.filter((entry) => entry.status === "fulfilled").length, 1);
      const rejected = outcomes.find((entry) => entry.status === "rejected");
      assert.ok(rejected?.status === "rejected" && rejected.reason instanceof KnowledgeError);
      assert.equal(rejected.reason.code, "APPROVED_VERSION_EXISTS");
      const eligible = await repository.listRetrievableChunks(shopA);
      assert.equal(eligible.length, 1);
      const approvedRow = eligible[0]!;
      const currentCitation = {
        workspaceId: shopA.workspaceId,
        sourceId: approvedRow.source.sourceId,
        sourceVersionId: approvedRow.version.versionId,
        chunkId: approvedRow.chunk.chunkId,
        locator: approvedRow.chunk.locator,
      } as const;
      assert.equal(await repository.isCurrentCitation(shopA, currentCitation), true);
      assert.equal(await repository.isCurrentCitation(shopA, { ...currentCitation, chunkId: "missing" }), false);
      assert.equal(await repository.isCurrentCitation(shopA, { ...currentCitation, workspaceId: shopB.workspaceId }), false);
      assert.equal(await repository.isCurrentCitation(shopA, { ...currentCitation, locator: { kind: "chunk", chunkIndex: 99 } }), false);
      assert.equal(await repository.areCurrentCitations(shopA, [currentCitation, currentCitation]), true);
      assert.equal(await repository.areCurrentCitations(shopA, [currentCitation, { ...currentCitation, chunkId: "missing" }]), false);
      const approved = eligible[0]!.version;
      assert.equal(approved.chunks.length, 1);
      const multiChunkDraft = createFaqVersion({
        workspace: shopA, sourceId: "multi-chunk", versionId: "v1", title: "Large FAQ",
        content: `${"ข้อมูล ".repeat(60)}${"รายละเอียด ".repeat(50)}`,
      });
      await repository.createSource(shopA, { sourceId: "multi-chunk", title: "Large FAQ", kind: "faq" });
      await repository.createVersion(shopA, multiChunkDraft);
      await repository.transitionVersion(shopA, "multi-chunk", "v1", "validating");
      await repository.transitionVersion(shopA, "multi-chunk", "v1", "extracting");
      await repository.transitionVersion(shopA, "multi-chunk", "v1", "indexed");
      await repository.approveVersion(shopA, "multi-chunk", "v1", { approvedBy: "staff-1" });
      const multiChunkRows = (await repository.listRetrievableChunks(shopA)).filter((entry) => entry.source.sourceId === "multi-chunk");
      assert.ok(multiChunkRows.length > 1);
      assert.ok(multiChunkRows.every((entry) => entry.version === multiChunkRows[0]!.version));
      await assert.rejects(database.transaction(async (transaction) => {
        await transaction.exec("SET LOCAL ROLE knowledge_runtime");
        await transaction.query("SELECT set_config('app.workspace_id', $1, true)", [shopA.workspaceId]);
        await transaction.query(
          `INSERT INTO knowledge_chunks
            (workspace_id, source_id, version_id, chunk_id, chunk_index, text, locator_kind,
             locator_chunk_index, locator_position, start_offset, end_offset)
           VALUES ($1, $2, $3, 'late-chunk', 99, 'late content', 'span', 99, NULL, 0, 12)`,
          [shopA.workspaceId, approved.sourceId, approved.versionId],
        );
      }));
      await repository.revokeVersion(shopA, approved.sourceId, approved.versionId, {
        revokedBy: "staff-1", reason: "superseded", revokedAt: "2026-10-16T02:00:00.000Z",
      });
      assert.equal(await repository.isCurrentCitation(shopA, {
        workspaceId: shopA.workspaceId, sourceId: approved.sourceId, sourceVersionId: approved.versionId,
        chunkId: approvedRow.chunk.chunkId, locator: approvedRow.chunk.locator,
      }), false);
      await repository.revokeVersion(shopA, "multi-chunk", "v1", {
        revokedBy: "staff-1", reason: "superseded", revokedAt: "2026-10-16T02:00:00.000Z",
      });
      assert.deepEqual(await repository.listRetrievableChunks(shopA), []);
    });

    await t.test("archived source cannot approve an indexed version", async () => {
      await addIndexedFaq(repository, shopA, "archived-approval", "v1");
      await repository.archiveSource(shopA, "archived-approval");
      await assert.rejects(repository.approveVersion(shopA, "archived-approval", "v1", { approvedBy: "staff-1" }),
        (error: unknown) => error instanceof KnowledgeError && error.code === "APPROVAL_NOT_ELIGIBLE");
      assert.deepEqual((await repository.listRetrievableChunks(shopA)).filter((row) => row.source.sourceId === "archived-approval"), []);
    });

    await t.test("FAQ, PDF page and CSV row citations round-trip exactly", async () => {
      const faq = await repository.getVersion(shopA, "approval", "v1");
      assert.ok(faq);
      assert.equal(faq.chunks[0]?.locator.kind, "span");

      const pdf = createImportedKnowledgeVersion({
        workspace: shopA, sourceId: "manual", versionId: "pdf-v1", title: "Manual", kind: "pdf",
        segments: [{ text: "หน้าหนึ่ง ระยะรับประกัน 2 ปี", locator: { kind: "page", page: 1 } }],
        createdAt: "2026-10-16T00:00:00.000Z",
      });
      await repository.createSource(shopA, { sourceId: "manual", title: "Manual", kind: "pdf" });
      await repository.createVersion(shopA, pdf);
      assert.deepEqual((await repository.getVersion(shopA, "manual", "pdf-v1"))?.chunks, pdf.chunks);

      const csv = createImportedKnowledgeVersion({
        workspace: shopA, sourceId: "catalog", versionId: "csv-v1", title: "Catalog", kind: "csv",
        segments: [{ text: "SKU ZX-650 ราคา 1250", locator: { kind: "row", row: 2 } }],
        createdAt: "2026-10-16T00:00:00.000Z",
      });
      await repository.createSource(shopA, { sourceId: "catalog", title: "Catalog", kind: "csv" });
      await repository.createVersion(shopA, csv);
      assert.deepEqual((await repository.getVersion(shopA, "catalog", "csv-v1"))?.chunks, csv.chunks);
    });

    await t.test("failed chunk persistence rolls back its version row", async () => {
      await repository.createSource(shopA, { sourceId: "rollback", title: "Rollback", kind: "faq" });
      const draft = createFaqVersion({ workspace: shopA, sourceId: "rollback", versionId: "v1", title: "Rollback", content: "A short answer" });
      const failingRepository = new PostgresKnowledgeRepository(databasePort(database, true));
      await assert.rejects(failingRepository.createVersion(shopA, draft), { code: "INVALID_KNOWLEDGE_INPUT" });
      assert.equal(await repository.getVersion(shopA, "rollback", "v1"), null);
    });

    await t.test("invalid tenant-bound drafts fail before touching SQL", async () => {
      const foreign = createFaqVersion({ workspace: shopB, sourceId: "foreign", versionId: "v1", title: "FAQ", content: "Answer" });
      await assert.rejects(repository.createVersion(shopA, foreign), { code: "CROSS_WORKSPACE_ACCESS_DENIED" });
      assert.equal(await repository.getVersion(shopA, "foreign", "v1"), null);
    });

    await t.test("rejects noncanonical chunk segmentation for FAQ and imported sources", async () => {
      const content = `${"a".repeat(195)} ${"b".repeat(200)}`;
      const faq = createFaqVersion({ workspace: shopA, sourceId: "noncanonical-faq", versionId: "v1", title: "FAQ", content });
      const faqChunks = [
        { ...faq.chunks[0]!, chunkId: "noncanonical-faq:v1:0", chunkIndex: 0, text: content.slice(0, 250), start: 0, end: 250,
          locator: { kind: "span" as const, chunkIndex: 0, start: 0, end: 250 } },
        { ...faq.chunks[1]!, chunkId: "noncanonical-faq:v1:1", chunkIndex: 1, text: content.slice(250), start: 250, end: content.length,
          locator: { kind: "span" as const, chunkIndex: 1, start: 250, end: content.length } },
      ];
      await repository.createSource(shopA, { sourceId: faq.sourceId, title: faq.title, kind: "faq" });
      await assert.rejects(repository.createVersion(shopA, { ...faq, chunks: faqChunks }), { code: "INVALID_KNOWLEDGE_INPUT" });

      const pdf = createImportedKnowledgeVersion({
        workspace: shopA, sourceId: "noncanonical-pdf", versionId: "v1", title: "PDF", kind: "pdf",
        segments: [{ text: content, locator: { kind: "page", page: 4 } }],
      });
      const pdfChunks = [
        { ...pdf.chunks[0]!, chunkId: "noncanonical-pdf:v1:0", chunkIndex: 0, text: content.slice(0, 250), start: 0, end: 250,
          locator: { kind: "page" as const, page: 4, chunkIndex: 0 } },
        { ...pdf.chunks[1]!, chunkId: "noncanonical-pdf:v1:1", chunkIndex: 1, text: content.slice(250), start: 250, end: content.length,
          locator: { kind: "page" as const, page: 4, chunkIndex: 1 } },
      ];
      await repository.createSource(shopA, { sourceId: pdf.sourceId, title: pdf.title, kind: "pdf" });
      await assert.rejects(repository.createVersion(shopA, { ...pdf, chunks: pdfChunks }), { code: "INVALID_KNOWLEDGE_INPUT" });
      assert.equal(await repository.getVersion(shopA, faq.sourceId, faq.versionId), null);
      assert.equal(await repository.getVersion(shopA, pdf.sourceId, pdf.versionId), null);
    });

    await t.test("persists a canonical CSV draft whose segment boundaries create more than 5,000 chunks", async () => {
      const segments = Array.from({ length: 5_000 }, (_, index) => ({
        text: index < 200 ? "x".repeat(321) : "x",
        locator: { kind: "row" as const, row: index + 1 },
      }));
      const csv = createImportedKnowledgeVersion({
        workspace: shopA, sourceId: "large-catalog", versionId: "csv-v1", title: "Large catalog", kind: "csv", segments,
      });
      assert.equal(csv.chunks.length, 5_200);
      await repository.createSource(shopA, { sourceId: csv.sourceId, title: csv.title, kind: "csv" });
      const persisted = await repository.createVersion(shopA, csv);
      assert.equal(persisted.chunks.length, 5_200);
      assert.equal((await repository.getVersion(shopA, csv.sourceId, csv.versionId))?.chunks.length, 5_200);
    });
  } finally {
    await database.close();
  }
});
