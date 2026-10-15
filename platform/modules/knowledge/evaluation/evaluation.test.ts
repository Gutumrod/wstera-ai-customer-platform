import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeKnowledgeEvaluation } from "./evaluator.js";
import { runSyntheticKnowledgeBaseline } from "./synthetic-baseline.js";

test("evaluation summary reports recall, precision, citation validity, abstention, and latency separately", () => {
  const summary = summarizeKnowledgeEvaluation([
    {
      category: "answerable",
      expected: "answer",
      relevantKeys: ["a@v1"],
      returned: [{ key: "a@v1", citationValid: true }, { key: "wrong@v1", citationValid: true }],
      latencyMs: 10,
    },
    {
      category: "answerable",
      expected: "answer",
      relevantKeys: ["b@v1", "c@v1"],
      returned: [{ key: "b@v1", citationValid: false }],
      latencyMs: 30,
    },
    { category: "negative", expected: "retrieval_abstain", relevantKeys: [], returned: [], latencyMs: 20 },
    { category: "negative", expected: "retrieval_abstain", relevantKeys: [], returned: [{ key: "extra@v1", citationValid: true }], latencyMs: 40 },
  ], 3);

  assert.deepEqual(summary, {
    k: 3,
    queryCount: 4,
    answerableQueryCount: 2,
    unanswerableQueryCount: 2,
    policyAbstainQueryCount: 0,
    recallAtK: 0.75,
    precisionAtK: 1 / 3,
    citationPrecision: 3 / 4,
    abstentionAccuracy: 0.5,
    latencyP50Ms: 25,
    latencyP95Ms: 40,
  });
});

test("empty evaluation returns null rates and zero latency instead of NaN", () => {
  assert.deepEqual(summarizeKnowledgeEvaluation([], 3), {
    k: 3,
    queryCount: 0,
    answerableQueryCount: 0,
    unanswerableQueryCount: 0,
    policyAbstainQueryCount: 0,
    recallAtK: null,
    precisionAtK: null,
    citationPrecision: null,
    abstentionAccuracy: null,
    latencyP50Ms: 0,
    latencyP95Ms: 0,
  });
});

test("Precision@k divides relevant returned evidence by k, including when fewer than k hits return", () => {
  type Summarizer = (observations: Parameters<typeof summarizeKnowledgeEvaluation>[0], k: number) => ReturnType<typeof summarizeKnowledgeEvaluation>;
  const summarizeAtK = summarizeKnowledgeEvaluation as unknown as Summarizer;
  const summary = summarizeAtK([{
    category: "answerable",
    expected: "answer",
    relevantKeys: ["doc@v1#chunk-0#page-4"],
    returned: [{ key: "doc@v1#chunk-0#page-4", citationValid: true }],
    latencyMs: 0,
  }], 3);
  assert.equal(summary.precisionAtK, 1 / 3);
});

test("a wrong page from the correct source and version is not relevant evidence", () => {
  const summary = summarizeKnowledgeEvaluation([{
    category: "answerable",
    expected: "answer",
    relevantKeys: ["manual@v1#manual:v1:0#page-4"],
    returned: [{ key: "manual@v1#manual:v1:1#page-9", citationValid: true }],
    latencyMs: 0,
  }], 3);
  assert.equal(summary.recallAtK, 0);
  assert.equal(summary.precisionAtK, 0);
});

test("synthetic baseline covers 30 FAQ, PDF, CSV and negative cases with verifiable citations", async () => {
  const baseline = await runSyntheticKnowledgeBaseline(3);
  assert.equal(baseline.cases.length, 30);
  assert.equal(baseline.summary.queryCount, 30);
  assert.equal(baseline.summary.citationPrecision, 1);
  assert.ok(Math.abs((baseline.summary.precisionAtK ?? 0) - 1 / 3) < 1e-12);
  const brake = baseline.cases.find((item) => item.id === "pdf-01");
  assert.equal(brake?.expectedKeys.some((value) => value.includes("#page:4:")), true);
  assert.equal(brake?.expectedKeys.some((value) => value.includes("#page:5:")), false);
  assert.equal(brake?.returnedKeys.some((value) => value.includes("#page:4:")), true);
  const zx650 = baseline.cases.find((item) => item.id === "csv-01");
  assert.equal(zx650?.expectedKeys.some((value) => value.includes("#row:2:")), true);
  assert.equal(zx650?.returnedKeys.some((value) => value.includes("#row:3:")), true);
  assert.equal(baseline.cases.find((item) => item.id === "revoked-01")?.returnedKeys.length, 0);
  const conflict = baseline.cases.find((item) => item.id === "conflict-01");
  assert.deepEqual(
    [...(conflict?.returnedKeys ?? [])].sort(),
    [...(conflict?.expectedKeys ?? [])].sort(),
  );
  assert.equal(baseline.cases.find((item) => item.id === "unknown-01")?.returnedKeys.length, 0);
  const injection = baseline.cases.find((item) => item.id === "injection-01");
  assert.equal(injection?.returnedKeys[0], injection?.expectedKeys[0]);
  assert.ok(baseline.limitations.some((item) => item.includes("No language model")));
});

test("synthetic corpus manifest enforces unique cases, outcomes, source kinds, and locators", async () => {
  type Coverage = Readonly<{
    caseCount: number;
    uniqueCaseCount: number;
    expectedCounts: Readonly<Record<string, number>>;
    categories: Readonly<Record<string, number>>;
    sourceKindCounts: Readonly<Record<string, number>>;
    locatorKindsBySourceKind: Readonly<Record<string, readonly string[]>>;
    mixedLanguageQueryCount: number;
    multiPagePdfDocuments: number;
    multiRowCsvDocuments: number;
    thaiTypoQueries: readonly string[];
  }>;
  type BaselineModule = typeof import("./synthetic-baseline.js") & { syntheticKnowledgeCoverage?: Coverage };
  const module = await import("./synthetic-baseline.js") as BaselineModule;
  const coverage = module.syntheticKnowledgeCoverage;
  assert.ok(coverage, "evaluation must publish a checkable corpus coverage manifest");
  if (!coverage) return;
  assert.equal(coverage.caseCount, 30);
  assert.equal(coverage.uniqueCaseCount, 30);
  assert.deepEqual(coverage.expectedCounts, { answer: 27, retrieval_abstain: 2, policy_abstain: 1 });
  assert.deepEqual(coverage.categories, {
    faq: 8,
    "thai-typo": 1,
    pdf: 8,
    "csv-sku": 7,
    "sku-punctuation-variant": 1,
    contradiction: 1,
    revoked: 1,
    "no-answer": 1,
    forbidden: 1,
    "prompt-injection-fixture": 1,
  });
  assert.deepEqual(coverage.sourceKindCounts, { faq: 12, pdf: 8, csv: 7 });
  assert.deepEqual(coverage.locatorKindsBySourceKind, { faq: ["span"], pdf: ["page"], csv: ["row"] });
  assert.ok(coverage.mixedLanguageQueryCount > 0);
  assert.ok(coverage.multiPagePdfDocuments > 0);
  assert.ok(coverage.multiRowCsvDocuments > 0);
  assert.match(coverage.thaiTypoQueries.join(" "), /จัดสง/);
});
