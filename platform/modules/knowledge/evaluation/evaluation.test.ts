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
    { category: "negative", expected: "abstain", relevantKeys: [], returned: [], latencyMs: 20 },
    { category: "negative", expected: "abstain", relevantKeys: [], returned: [{ key: "extra@v1", citationValid: true }], latencyMs: 40 },
  ]);

  assert.deepEqual(summary, {
    queryCount: 4,
    answerableQueryCount: 2,
    unanswerableQueryCount: 2,
    recallAtK: 0.75,
    precisionAtK: 0.75,
    citationPrecision: 3 / 4,
    abstentionAccuracy: 0.5,
    latencyP50Ms: 25,
    latencyP95Ms: 40,
  });
});

test("empty evaluation returns null rates and zero latency instead of NaN", () => {
  assert.deepEqual(summarizeKnowledgeEvaluation([]), {
    queryCount: 0,
    answerableQueryCount: 0,
    unanswerableQueryCount: 0,
    recallAtK: null,
    precisionAtK: null,
    citationPrecision: null,
    abstentionAccuracy: null,
    latencyP50Ms: 0,
    latencyP95Ms: 0,
  });
});

test("synthetic baseline covers 30 FAQ, PDF, CSV and negative cases with verifiable citations", async () => {
  const baseline = await runSyntheticKnowledgeBaseline(3);
  assert.equal(baseline.cases.length, 30);
  assert.equal(baseline.summary.queryCount, 30);
  assert.equal(baseline.summary.citationPrecision, 1);
  assert.equal(baseline.cases.find((item) => item.id === "revoked-01")?.returnedKeys.length, 0);
  assert.deepEqual(
    [...(baseline.cases.find((item) => item.id === "conflict-01")?.returnedKeys ?? [])].sort(),
    ["faq-conflict-a@v1", "faq-conflict-b@v1"],
  );
  assert.equal(baseline.cases.find((item) => item.id === "unknown-01")?.returnedKeys.length, 0);
  assert.equal(baseline.cases.find((item) => item.id === "injection-01")?.returnedKeys[0], "faq-injection@v1");
  assert.ok(baseline.limitations.some((item) => item.includes("No language model")));
});
