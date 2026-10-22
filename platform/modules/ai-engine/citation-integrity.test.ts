import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnowledgeCitation, KnowledgeRetrievalHit } from "../../contracts/data/knowledge.js";
import type { TrustedWorkspaceContext } from "../../contracts/tenancy/index.js";
import { validateAnswerCitations } from "./citation-integrity.js";

const workspace: TrustedWorkspaceContext = Object.freeze({
  workspaceId: "shop_a",
  connectionId: "web_demo",
  channel: "web",
});

function hit(locator: KnowledgeCitation["locator"], workspaceId = "shop_a"): KnowledgeRetrievalHit {
  return {
    sourceId: "manual",
    versionId: "v1",
    title: "Manual",
    text: "Synthetic evidence",
    score: 1,
    citation: { workspaceId, sourceId: "manual", sourceVersionId: "v1", chunkId: "manual:v1:0", locator },
  };
}

function citation(evidenceHit: KnowledgeRetrievalHit): KnowledgeCitation {
  return evidenceHit.citation;
}

test("accepts canonical FAQ, PDF page, and CSV row citations from retrieved evidence", () => {
  for (const locator of [
    { kind: "span", chunkIndex: 0, start: 0, end: 18 },
    { kind: "page", page: 4, chunkIndex: 0 },
    { kind: "row", row: 2, chunkIndex: 0 },
  ] satisfies KnowledgeCitation["locator"][]) {
    const item = hit(locator);
    const result = validateAnswerCitations(workspace, { text: "มีข้อมูลตามเอกสาร", citations: [citation(item)] }, [item]);
    assert.equal(result.kind, "accepted");
    if (result.kind === "accepted") assert.deepEqual(result.answer.citations, [item.citation]);
  }
});

test("deduplicates repeated citations and returns the canonical evidence reference", () => {
  const item = hit({ kind: "page", page: 4 });
  const draftCitation = { ...item.citation };
  const result = validateAnswerCitations(workspace, {
    text: "คำตอบ",
    citations: [draftCitation, draftCitation],
  }, [item]);
  assert.equal(result.kind, "accepted");
  if (result.kind === "accepted") {
    assert.equal(result.answer.citations.length, 1);
    assert.equal(result.answer.citations[0], item.citation);
  }
});

test("normalizes omitted page and row chunk indexes to zero", () => {
  for (const locator of [{ kind: "page", page: 4 }, { kind: "row", row: 3 }] satisfies KnowledgeCitation["locator"][]) {
    const canonicalLocator = { ...locator, chunkIndex: 0 } as KnowledgeCitation["locator"];
    const item = hit(canonicalLocator);
    const draft = { ...item.citation, locator };
    assert.equal(validateAnswerCitations(workspace, { text: "คำตอบ", citations: [draft] }, [item]).kind, "accepted");
  }
});

test("hands off when evidence or citations are absent", () => {
  const item = hit({ kind: "row", row: 3 });
  assert.deepEqual(validateAnswerCitations(workspace, { text: "คำตอบ", citations: [citation(item)] }, []), {
    kind: "handoff", reason: "NO_APPROVED_EVIDENCE",
  });
  assert.deepEqual(validateAnswerCitations(workspace, { text: "คำตอบ", citations: [] }, [item]), {
    kind: "handoff", reason: "NO_CITATIONS",
  });
});

test("hands off for malformed draft and empty answer text", () => {
  const item = hit({ kind: "row", row: 3 });
  assert.deepEqual(validateAnswerCitations(workspace, null, [item]), { kind: "handoff", reason: "INVALID_DRAFT" });
  assert.deepEqual(validateAnswerCitations(workspace, { text: "  ", citations: [citation(item)] }, [item]), {
    kind: "handoff", reason: "EMPTY_ANSWER",
  });
});

test("fails closed on foreign evidence and cross-workspace citations", () => {
  const foreign = hit({ kind: "span", chunkIndex: 0, start: 0, end: 18 }, "shop_b");
  assert.deepEqual(validateAnswerCitations(workspace, { text: "คำตอบ", citations: [citation(foreign)] }, [foreign]), {
    kind: "handoff", reason: "INVALID_EVIDENCE_CONTEXT",
  });
  const local = hit({ kind: "page", page: 4 });
  const forged = { ...local.citation, workspaceId: "shop_b" };
  assert.deepEqual(validateAnswerCitations(workspace, { text: "คำตอบ", citations: [forged] }, [local]), {
    kind: "handoff", reason: "CROSS_WORKSPACE_CITATION",
  });
});

test("fails closed when retrieval hit metadata does not match its citation identity", () => {
  for (const inconsistent of [
    { ...hit({ kind: "page", page: 4 }), versionId: "v2" },
    { ...hit({ kind: "page", page: 4 }), sourceId: "other-source" },
  ]) {
    assert.deepEqual(validateAnswerCitations(workspace, {
      text: "คำตอบ",
      citations: [citation(inconsistent)],
    }, [inconsistent]), { kind: "handoff", reason: "INVALID_EVIDENCE_CONTEXT" });
  }
});

test("rejects fabricated evidence identities and malformed locators", () => {
  const item = hit({ kind: "page", page: 4 });
  const fabricated = { ...item.citation, chunkId: "manual:v1:99" };
  assert.deepEqual(validateAnswerCitations(workspace, { text: "คำตอบ", citations: [fabricated] }, [item]), {
    kind: "handoff", reason: "UNSUPPORTED_CITATION",
  });
  const malformed = { ...item.citation, locator: { kind: "page", page: 0 } };
  assert.deepEqual(validateAnswerCitations(workspace, { text: "คำตอบ", citations: [malformed] }, [item]), {
    kind: "handoff", reason: "MALFORMED_CITATION",
  });
  const extraLocatorField = { ...item.citation, locator: { kind: "page", page: 4, extra: true } };
  assert.deepEqual(validateAnswerCitations(workspace, { text: "คำตอบ", citations: [extraLocatorField] }, [item]), {
    kind: "handoff", reason: "MALFORMED_CITATION",
  });
});
