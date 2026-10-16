import assert from "node:assert/strict";
import test from "node:test";
import type { KnowledgeRetrievalHit, KnowledgeRetrievalPort } from "../../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../../contracts/tenancy/index.js";
import type { AnswerabilityPort, GroundedAnswerPort, SupportHandoffPort } from "./support-orchestrator.js";
import { SupportOrchestrator } from "./support-orchestrator.js";

const workspace: TrustedWorkspaceContext = Object.freeze({ workspaceId: "shop-1", connectionId: "web-1", channel: "web" });
const hit: KnowledgeRetrievalHit = Object.freeze({
  sourceId: "faq-shipping",
  versionId: "v1",
  title: "Shipping FAQ",
  text: "ส่งสินค้าภายใน 2 วันทำการ",
  score: 1,
  citation: Object.freeze({
    workspaceId: "shop-1",
    sourceId: "faq-shipping",
    sourceVersionId: "v1",
    chunkId: "chunk-0",
    locator: Object.freeze({ kind: "span" as const, chunkIndex: 0, start: 0, end: 28 }),
  }),
});

function harness(options: {
  result?: Readonly<{ kind: "evidence"; hits: readonly KnowledgeRetrievalHit[] } | { kind: "no_answer"; reason: "NO_APPROVED_EVIDENCE" }>;
  assessment?: unknown;
  generated?: unknown;
  malformedRetrieval?: boolean;
  throwingRetrievalGetter?: boolean;
  retrievalFails?: boolean;
  assessmentFails?: boolean;
  generationFails?: boolean;
  handoffFails?: boolean;
  conversationStatus?: "ai_active" | "handoff_requested" | "human_active";
  pauseAfterGeneration?: boolean;
  conversationFails?: boolean;
  mutateWorkspaceDuringRetrieval?: boolean;
} = {}) {
  const calls = { assessment: 0, generation: 0, handoff: [] as string[] };
  let conversationLoads = 0;
  const conversations = {
    async load(receivedWorkspace: TrustedWorkspaceContext, conversationId: string) {
      conversationLoads++;
      assert.equal(receivedWorkspace.workspaceId, "shop-1");
      assert.equal(conversationId, "conversation-1");
      if (options.conversationFails) throw new Error("private conversation detail");
      return {
        workspaceId: "shop-1",
        conversationId: "conversation-1",
        status: options.pauseAfterGeneration && conversationLoads > 1 ? "human_active" : options.conversationStatus ?? "ai_active",
        version: options.pauseAfterGeneration && conversationLoads > 1 ? 2 : 1,
        createdAt: "2026-10-16T00:00:00.000Z",
        updatedAt: "2026-10-16T00:00:00.000Z",
      } as const;
    },
  };
  const retrieval: KnowledgeRetrievalPort = {
    async search(query) {
      if (options.retrievalFails) throw new Error("private retrieval detail");
      if (options.mutateWorkspaceDuringRetrieval) {
        (query.workspace as { workspaceId: string }).workspaceId = "other-shop";
      }
      if (options.throwingRetrievalGetter) return new Proxy({}, { get() { throw new Error("getter trap"); } }) as never;
      if (options.malformedRetrieval) return null as never;
      return options.result ?? { kind: "evidence", hits: [hit] };
    },
  };
  const answerability: AnswerabilityPort = {
    async assess() {
      calls.assessment++;
      if (options.assessmentFails) throw new Error("private assessment detail");
      return options.assessment ?? { kind: "answerable" };
    },
  };
  const answer: GroundedAnswerPort = {
    async generate() {
      calls.generation++;
      if (options.generationFails) throw new Error("private model detail");
      return options.generated ?? { text: "ส่งภายใน 2 วันทำการ", citationRefs: ["evidence-1"] };
    },
  };
  const handoff: SupportHandoffPort = {
    async request(input) {
      calls.handoff.push(input.reason);
      assert.equal(input.workspace.workspaceId, "shop-1");
      assert.equal(input.conversationId, "conversation-1");
      if (options.handoffFails) throw new Error("private handoff detail");
    },
  };
  return { engine: new SupportOrchestrator({ conversations, retrieval, answerability, answer, handoff }), calls };
}

test("returns only a cited answer mapped from opaque evidence references", async () => {
  const { engine, calls } = harness();
  const result = await engine.respond({ workspace, conversationId: "conversation-1", query: "ส่งของกี่วัน" });
  assert.equal(result.kind, "answer");
  if (result.kind !== "answer") return;
  assert.equal(result.text, "ส่งภายใน 2 วันทำการ");
  assert.deepEqual(result.citations, [hit.citation]);
  assert.equal(result.conversationVersion, 1);
  assert.deepEqual(calls, { assessment: 1, generation: 1, handoff: [] });
});

test("no approved evidence requests handoff without invoking assessment or model", async () => {
  const { engine, calls } = harness({ result: { kind: "no_answer", reason: "NO_APPROVED_EVIDENCE" } });
  assert.deepEqual(await engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), {
    kind: "handoff_requested", reason: "NO_APPROVED_EVIDENCE",
  });
  assert.deepEqual(calls, { assessment: 0, generation: 0, handoff: ["NO_APPROVED_EVIDENCE"] });
});

test("insufficient, conflicting, and uncertain evidence fail closed to handoff", async (t) => {
  for (const [kind, reason] of [
    ["insufficient_evidence", "INSUFFICIENT_EVIDENCE"],
    ["conflicting_evidence", "CONFLICTING_EVIDENCE"],
    ["uncertain", "UNCERTAIN_ANSWERABILITY"],
  ] as const) {
    await t.test(kind, async () => {
      const { engine, calls } = harness({ assessment: { kind } });
      assert.deepEqual(await engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), {
        kind: "handoff_requested", reason,
      });
      assert.equal(calls.generation, 0);
    });
  }
});

test("malformed assessment, provider errors, and bad citations never produce an answer", async (t) => {
  const cases = [
    { name: "assessment shape", options: { assessment: { kind: "answerable", workspaceId: "other" } }, reason: "ANSWERABILITY_UNAVAILABLE" },
    { name: "assessment getter throws", options: { assessment: new Proxy({}, { get() { throw new Error("getter trap"); } }) }, reason: "ANSWERABILITY_UNAVAILABLE" },
    { name: "assessment failure", options: { assessmentFails: true }, reason: "ANSWERABILITY_UNAVAILABLE" },
    { name: "generation failure", options: { generationFails: true }, reason: "GENERATION_UNAVAILABLE" },
    { name: "foreign evidence reference", options: { generated: { text: "คำตอบ", citationRefs: ["other"] } }, reason: "UNSUPPORTED_CITATION" },
    { name: "empty answer", options: { generated: { text: "  ", citationRefs: ["evidence-1"] } }, reason: "INVALID_GENERATED_ANSWER" },
    { name: "oversized answer", options: { generated: { text: "a".repeat(16_001), citationRefs: ["evidence-1"] } }, reason: "INVALID_GENERATED_ANSWER" },
    { name: "too many citation references", options: { generated: { text: "คำตอบ", citationRefs: ["evidence-1", "evidence-1"] } }, reason: "INVALID_GENERATED_ANSWER" },
    { name: "extra model field", options: { generated: { text: "คำตอบ", citationRefs: ["evidence-1"], workspaceId: "shop-1" } }, reason: "INVALID_GENERATED_ANSWER" },
    { name: "generated getter throws", options: { generated: new Proxy({}, { get(_target, key) { if (key === "then") return undefined; throw new Error("getter trap"); } }) }, reason: "INVALID_GENERATED_ANSWER" },
  ] as const;
  for (const item of cases) {
    await t.test(item.name, async () => {
      const { engine, calls } = harness(item.options);
      assert.deepEqual(await engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), {
        kind: "handoff_requested", reason: item.reason,
      });
      assert.deepEqual(calls.handoff, [item.reason]);
    });
  }
});

test("retrieval and handoff failures are surfaced without leaking adapter errors", async () => {
  const retrievalFailure = harness({ retrievalFails: true });
  assert.deepEqual(await retrievalFailure.engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), {
    kind: "handoff_requested", reason: "RETRIEVAL_UNAVAILABLE",
  });

  const malformedRetrieval = harness({ malformedRetrieval: true });
  assert.deepEqual(await malformedRetrieval.engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), {
    kind: "handoff_requested", reason: "RETRIEVAL_UNAVAILABLE",
  });
  const throwingRetrieval = harness({ throwingRetrievalGetter: true });
  assert.deepEqual(await throwingRetrieval.engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), {
    kind: "handoff_requested", reason: "RETRIEVAL_UNAVAILABLE",
  });

  const crossWorkspaceHit = Object.freeze({
    ...hit,
    citation: Object.freeze({ ...hit.citation, workspaceId: "other-shop" }),
  });
  const foreignEvidence = harness({ result: { kind: "evidence", hits: [crossWorkspaceHit] } });
  assert.deepEqual(await foreignEvidence.engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), {
    kind: "handoff_requested", reason: "RETRIEVAL_UNAVAILABLE",
  });

  const contextMutation = harness({ mutateWorkspaceDuringRetrieval: true });
  assert.deepEqual(await contextMutation.engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), {
    kind: "handoff_requested", reason: "RETRIEVAL_UNAVAILABLE",
  });

  const handoffFailure = harness({ result: { kind: "no_answer", reason: "NO_APPROVED_EVIDENCE" }, handoffFails: true });
  assert.deepEqual(await handoffFailure.engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), {
    kind: "handoff_unavailable", reason: "NO_APPROVED_EVIDENCE",
  });
});

test("invalid request is rejected before any port is called", async () => {
  const { engine, calls } = harness();
  assert.deepEqual(await engine.respond({ workspace, conversationId: "bad id", query: "ถาม" }), { kind: "invalid_request" });
  assert.deepEqual(await engine.respond(null as never), { kind: "invalid_request" });
  assert.deepEqual(await engine.respond({ workspace: { workspaceId: 1 } as never, conversationId: "conversation-1", query: "ถาม" }), { kind: "invalid_request" });
  assert.deepEqual(calls, { assessment: 0, generation: 0, handoff: [] });
});

test("paused conversations stop before retrieval and a handoff during generation suppresses the answer", async (t) => {
  await t.test("already paused", async () => {
    const { engine, calls } = harness({ conversationStatus: "human_active" });
    assert.deepEqual(await engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), { kind: "ai_paused" });
    assert.deepEqual(calls, { assessment: 0, generation: 0, handoff: [] });
  });
  await t.test("handoff starts while generating", async () => {
    const { engine } = harness({ pauseAfterGeneration: true });
    assert.deepEqual(await engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), { kind: "ai_paused" });
  });
  await t.test("conversation state unavailable", async () => {
    const { engine } = harness({ conversationFails: true });
    assert.deepEqual(await engine.respond({ workspace, conversationId: "conversation-1", query: "ถาม" }), { kind: "conversation_unavailable" });
  });
});
