export type KnowledgeEvaluationObservation = Readonly<{
  category: string;
  expected: "answer" | "retrieval_abstain" | "policy_abstain";
  relevantKeys: readonly string[];
  returned: readonly Readonly<{ key: string; citationValid: boolean }>[];
  latencyMs: number;
}>;

export type KnowledgeEvaluationSummary = Readonly<{
  k: number;
  queryCount: number;
  answerableQueryCount: number;
  unanswerableQueryCount: number;
  policyAbstainQueryCount: number;
  recallAtK: number | null;
  precisionAtK: number | null;
  citationPrecision: number | null;
  abstentionAccuracy: number | null;
  latencyP50Ms: number;
  latencyP95Ms: number;
}>;

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function percentileNearestRank(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(percentile * ordered.length) - 1)]!;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]!
    : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

/** Summarizes retrieval evidence only; it does not measure generated-answer grounding. */
export function summarizeKnowledgeEvaluation(
  observations: readonly KnowledgeEvaluationObservation[],
  k: number,
): KnowledgeEvaluationSummary {
  if (!Number.isInteger(k) || k < 1 || k > 20) throw new RangeError("k must be between 1 and 20");
  if (observations.some((item) => !Number.isFinite(item.latencyMs) || item.latencyMs < 0)) {
    throw new RangeError("latencyMs observations must be finite and non-negative");
  }
  const answerable = observations.filter((item) => item.expected === "answer");
  const unanswerable = observations.filter((item) => item.expected === "retrieval_abstain");
  const policyAbstain = observations.filter((item) => item.expected === "policy_abstain");
  const recalls = answerable.map((item) => {
    const relevant = new Set(item.relevantKeys);
    if (relevant.size === 0) return 0;
    const found = new Set(item.returned.slice(0, k).map((hit) => hit.key));
    return [...relevant].filter((key) => found.has(key)).length / relevant.size;
  });
  const precisions = answerable.map((item) => {
    const relevant = new Set(item.relevantKeys);
    const uniqueReturned = new Set(item.returned.slice(0, k).map((hit) => hit.key));
    return [...uniqueReturned].filter((key) => relevant.has(key)).length / k;
  });
  const citationCount = observations.reduce((total, item) => total + Math.min(item.returned.length, k), 0);
  const citationPrecision = citationCount === 0
    ? null
    : observations.reduce((total, item) => total + item.returned.slice(0, k).filter((hit) => hit.citationValid).length, 0) / citationCount;
  const abstentionAccuracy = unanswerable.length === 0
    ? null
    : unanswerable.filter((item) => item.returned.length === 0).length / unanswerable.length;
  const latencies = observations.map((item) => item.latencyMs);

  return Object.freeze({
    k,
    queryCount: observations.length,
    answerableQueryCount: answerable.length,
    unanswerableQueryCount: unanswerable.length,
    policyAbstainQueryCount: policyAbstain.length,
    recallAtK: mean(recalls),
    precisionAtK: mean(precisions),
    citationPrecision,
    abstentionAccuracy,
    latencyP50Ms: median(latencies),
    latencyP95Ms: percentileNearestRank(latencies, 0.95),
  });
}
