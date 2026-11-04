import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  KnowledgeCitation,
  KnowledgeRepositoryPort,
  KnowledgeRetrievalHit,
} from "../../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../../contracts/tenancy/index.js";
import { SupportOrchestrator } from "../ai-engine/support-orchestrator.js";
import { createTrustedWorkspace } from "../tenancy/workspace.js";
import {
  areKnowledgeCitationsCurrent,
  canonicalizeKnowledgeVersionDraft,
  createFaqVersion,
  retrieveKnowledge,
} from "./index.js";
import { InMemoryKnowledgeRepository } from "./testing/in-memory-repository.js";

const shopA = createTrustedWorkspace({ workspaceId: "shop-a", connectionId: "web-a", channel: "web" });
const shopB = createTrustedWorkspace({ workspaceId: "shop-b", connectionId: "web-b", channel: "web" });

const INTERNAL_TEXT = "รหัสลับภายใน INTERNAL-X1";
const CUSTOMER_TEXT = "จัดส่งภายใน 2 วันทำการ";
const INTERNAL_QUERY = "INTERNAL-X1";

/**
 * Test doubles stay loose on purpose: this file must also compile against the
 * pre-visibility contract so the new assertions can be run before the fix and
 * prove the leak instead of failing on a missing type.
 */
type LooseVersion = Readonly<Record<string, unknown>>;
type LooseRow = Readonly<{ source: LooseVersion; version: LooseVersion; chunk: LooseVersion }>;

function listChunks(repository: unknown, workspace: unknown, shortlist: unknown, audience: unknown): Promise<readonly LooseRow[]> {
  return (repository as { listRetrievableChunks: (...args: unknown[]) => Promise<readonly LooseRow[]> })
    .listRetrievableChunks(workspace, shortlist, audience);
}

function citationsCurrent(repository: unknown, workspace: unknown, citations: readonly unknown[], audience: unknown): Promise<boolean> {
  return (repository as { areCurrentCitations: (...args: unknown[]) => Promise<boolean> })
    .areCurrentCitations(workspace, citations, audience);
}

const knowledgeCitationsCurrent = areKnowledgeCitationsCurrent as unknown as (
  repository: unknown, workspace: unknown, citations: readonly unknown[], audience: unknown,
) => Promise<boolean>;

function addApprovedFaq(
  repository: InMemoryKnowledgeRepository,
  input: Readonly<{ sourceId: string; content: string; visibility?: "internal" | "customer"; workspace?: TrustedWorkspaceContext }>,
) {
  const workspace = input.workspace ?? shopA;
  const version = createFaqVersion({
    workspace,
    sourceId: input.sourceId,
    versionId: "v1",
    title: input.sourceId,
    content: input.content,
    ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
  } as never);
  repository.createSource(workspace, { sourceId: input.sourceId, title: input.sourceId, kind: "faq" });
  repository.createVersion(workspace, version);
  repository.transitionVersion(workspace, input.sourceId, "v1", "validating");
  repository.transitionVersion(workspace, input.sourceId, "v1", "extracting");
  repository.transitionVersion(workspace, input.sourceId, "v1", "indexed");
  repository.approveVersion(workspace, input.sourceId, "v1", { approvedBy: "staff-1" });
  return version;
}

function query(overrides: Readonly<Record<string, unknown>> = {}) {
  // No default audience key: a query that omits audience must be handled at runtime, not only by types.
  return { workspace: shopA, query: INTERNAL_QUERY, limit: 3, ...overrides } as never;
}

test("customer audience never receives internal knowledge even when the adapter returns every approved row", async () => {
  const repository = new InMemoryKnowledgeRepository();
  addApprovedFaq(repository, { sourceId: "internal-faq", content: INTERNAL_TEXT, visibility: "internal" });
  addApprovedFaq(repository, { sourceId: "customer-faq", content: CUSTOMER_TEXT, visibility: "customer" });

  // Adapter double that ignores audience completely: only the core filter can stop the leak.
  const leakingRepository = {
    async listRetrievableChunks() {
      return listChunks(repository, shopA, undefined, "staff");
    },
  } as unknown as KnowledgeRepositoryPort;

  assert.deepEqual(await retrieveKnowledge(leakingRepository, query({ query: INTERNAL_QUERY })), {
    kind: "no_answer", reason: "NO_APPROVED_EVIDENCE",
  }, "an internal chunk must not leak to a customer audience when the adapter over-returns");

  const overReturned = await retrieveKnowledge(leakingRepository, query({ query: "จัดส่ง" }));
  assert.equal(overReturned.kind, "evidence");
  assert.deepEqual(overReturned.kind === "evidence" ? overReturned.hits.map((hit) => hit.sourceId) : [], ["customer-faq"],
    "the core filter must drop internal rows even when the adapter returned them");

  const customerHit = await retrieveKnowledge(repository, query({ query: "จัดส่ง" }));
  assert.equal(customerHit.kind, "evidence");
  assert.deepEqual(customerHit.kind === "evidence" ? customerHit.hits.map((hit) => hit.sourceId) : [], ["customer-faq"]);

  const staffHit = await retrieveKnowledge(repository, query({ query: INTERNAL_QUERY, audience: "staff" }));
  assert.equal(staffHit.kind, "evidence");
  assert.deepEqual(staffHit.kind === "evidence" ? staffHit.hits.map((hit) => hit.sourceId) : [], ["internal-faq"]);
});

test("missing or unrecognised audience fails closed to customer", async () => {
  const repository = new InMemoryKnowledgeRepository();
  addApprovedFaq(repository, { sourceId: "internal-faq", content: INTERNAL_TEXT, visibility: "internal" });
  addApprovedFaq(repository, { sourceId: "customer-faq", content: CUSTOMER_TEXT, visibility: "customer" });

  // A query that simply omits the audience key is the realistic leak path: the
  // core must resolve it to "customer" instead of returning every approved row.
  assert.deepEqual(await retrieveKnowledge(repository, query({ query: INTERNAL_QUERY })), {
    kind: "no_answer", reason: "NO_APPROVED_EVIDENCE",
  }, "a query with no audience must resolve to customer and hide internal chunks");

  for (const audience of ["admin", "public", 42, null, { staff: true }]) {
    const result = await retrieveKnowledge(repository, query({ query: INTERNAL_QUERY, audience }));
    assert.deepEqual(result, { kind: "no_answer", reason: "NO_APPROVED_EVIDENCE" },
      `audience ${JSON.stringify(audience)} must resolve to customer`);
  }

  // A missing audience must resolve to exactly "customer", not to "deny everything".
  const customerText = await retrieveKnowledge(repository, query({ query: "จัดส่ง" }));
  assert.equal(customerText.kind, "evidence");
});

test("staff audience sees internal and customer versions while customer sees only customer versions", async () => {
  const repository = new InMemoryKnowledgeRepository();
  addApprovedFaq(repository, { sourceId: "internal-faq", content: INTERNAL_TEXT, visibility: "internal" });
  addApprovedFaq(repository, { sourceId: "customer-faq", content: CUSTOMER_TEXT, visibility: "customer" });

  const customerRows = await listChunks(repository, shopA, undefined, "customer");
  assert.deepEqual(customerRows.map((row) => row.source.sourceId).sort(), ["customer-faq"]);
  const staffRows = await listChunks(repository, shopA, undefined, "staff");
  assert.deepEqual(staffRows.map((row) => row.source.sourceId).sort(), ["customer-faq", "internal-faq"]);
});

test("a version created without an explicit visibility defaults to internal", async () => {
  const repository = new InMemoryKnowledgeRepository();
  const version = addApprovedFaq(repository, { sourceId: "default-faq", content: INTERNAL_TEXT });

  // Leak-first assertion: an omitted visibility must not become customer-visible.
  assert.deepEqual(await retrieveKnowledge(repository, query({ query: INTERNAL_QUERY })), {
    kind: "no_answer", reason: "NO_APPROVED_EVIDENCE",
  }, "a version with no explicit visibility must default to internal, not customer");
  assert.equal((version as unknown as Record<string, unknown>).visibility, "internal");
  assert.equal((await retrieveKnowledge(repository, query({ query: INTERNAL_QUERY, audience: "staff" }))).kind, "evidence");
});

test("an explicitly customer-visible version is retrievable by a customer", async () => {
  const repository = new InMemoryKnowledgeRepository();
  addApprovedFaq(repository, { sourceId: "customer-faq", content: CUSTOMER_TEXT, visibility: "customer" });
  const result = await retrieveKnowledge(repository, query({ query: "จัดส่ง" }));
  assert.equal(result.kind, "evidence");
  assert.deepEqual(result.kind === "evidence" ? result.hits.map((hit) => hit.sourceId) : [], ["customer-faq"]);
});

test("citation freshness rejects an internal citation for a customer audience", async () => {
  const repository = new InMemoryKnowledgeRepository();
  addApprovedFaq(repository, { sourceId: "internal-faq", content: INTERNAL_TEXT, visibility: "internal" });
  const staffResult = await retrieveKnowledge(repository, query({ query: INTERNAL_QUERY, audience: "staff" }));
  assert.equal(staffResult.kind, "evidence");
  if (staffResult.kind !== "evidence") return;
  const citation = staffResult.hits[0]!.citation;
  const citations = [citation] as readonly KnowledgeCitation[];

  assert.equal(await citationsCurrent(repository, shopA, citations, "customer"), false,
    "an internal citation must not stay fresh for a customer audience");
  assert.equal(await citationsCurrent(repository, shopA, citations, "staff"), true);
  assert.equal(await citationsCurrent(repository, shopB, citations, "staff"), false, "cross-workspace citations stay rejected");
  assert.equal(await knowledgeCitationsCurrent(repository, shopA, citations, "staff"), true);
  assert.equal(await knowledgeCitationsCurrent(repository, shopA, citations, "customer"), false);
});

test("canonicalizing a draft preserves its visibility instead of silently dropping it", () => {
  const draft = createFaqVersion({
    workspace: shopA, sourceId: "canonical", versionId: "v1", title: "FAQ", content: CUSTOMER_TEXT, visibility: "customer",
  } as never);
  const canonical = canonicalizeKnowledgeVersionDraft(shopA, draft);
  assert.equal((canonical as unknown as Record<string, unknown>).visibility, "customer");
});

test("support orchestrator forwards the trusted audience to retrieval and freshness and defaults to customer", async () => {
  const audiences: Array<{ retrieval: unknown; freshness: unknown }> = [];
  const hit: KnowledgeRetrievalHit = Object.freeze({
    sourceId: "faq-shipping",
    versionId: "v1",
    title: "Shipping FAQ",
    text: CUSTOMER_TEXT,
    score: 1,
    citation: Object.freeze({
      workspaceId: shopA.workspaceId,
      sourceId: "faq-shipping",
      sourceVersionId: "v1",
      chunkId: "chunk-0",
      locator: Object.freeze({ kind: "span" as const, chunkIndex: 0, start: 0, end: 16 }),
    }),
  });
  const engine = new SupportOrchestrator({
    conversations: {
      async load() {
        return {
          workspaceId: shopA.workspaceId, conversationId: "conversation-1", status: "ai_active", version: 1,
          createdAt: "2026-10-16T00:00:00.000Z", updatedAt: "2026-10-16T00:00:00.000Z",
        };
      },
    },
    retrieval: {
      async search(received) {
        audiences.push({ retrieval: (received as unknown as { audience?: unknown }).audience, freshness: undefined });
        return { kind: "evidence", hits: [hit] };
      },
    },
    evidenceFreshness: {
      async areCurrentAndApproved(_workspace, _citations, audience?: unknown) {
        audiences[audiences.length - 1]!.freshness = audience;
        return true;
      },
    },
    answerability: { async assess() { return { kind: "answerable" }; } },
    answer: { async generate() { return { text: "ส่งภายใน 2 วันทำการ", citationRefs: ["evidence-1"] }; } },
    handoff: { async request() { /* no handoff in this case */ } },
  });

  const request = (audience: unknown) => ({
    workspace: shopA, conversationId: "conversation-1", query: "ส่งของกี่วัน", audience,
  }) as never;

  assert.equal((await engine.respond(request("staff"))).kind, "answer");
  assert.deepEqual(audiences.at(-1), { retrieval: "staff", freshness: "staff" });

  assert.equal((await engine.respond(request(undefined))).kind, "answer");
  assert.deepEqual(audiences.at(-1), { retrieval: "customer", freshness: "customer" },
    "a missing audience must reach ports as customer, never as undefined");

  assert.equal((await engine.respond(request("owner"))).kind, "answer");
  assert.deepEqual(audiences.at(-1), { retrieval: "customer", freshness: "customer" });
});
