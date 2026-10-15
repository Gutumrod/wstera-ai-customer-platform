export type KnowledgeEvaluationObservation = Readonly<{
  category: string;
  expected: "answer" | "abstain";
  relevantKeys: readonly string[];
  returned: readonly Readonly<{ key: string; citationValid: boolean }>[];
  latencyMs: number;
}>;

export type KnowledgeEvaluationSummary = Readonly<{
  queryCount: number;
  answerableQueryCount: number;
  unanswerableQueryCount: number;
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
): KnowledgeEvaluationSummary {
  const answerable = observations.filter((item) => item.expected === "answer");
  const unanswerable = observations.filter((item) => item.expected === "abstain");
  const recalls = answerable.map((item) => {
    if (item.relevantKeys.length === 0) return 0;
    const found = new Set(item.returned.map((hit) => hit.key));
    return item.relevantKeys.filter((key) => found.has(key)).length / item.relevantKeys.length;
  });
  const precisions = answerable.map((item) => {
    if (item.returned.length === 0) return 0;
    const relevant = new Set(item.relevantKeys);
    return item.returned.filter((hit) => relevant.has(hit.key)).length / item.returned.length;
  });
  const citationCount = observations.reduce((total, item) => total + item.returned.length, 0);
  const citationPrecision = citationCount === 0
    ? null
    : observations.reduce((total, item) => total + item.returned.filter((hit) => hit.citationValid).length, 0) / citationCount;
  const abstentionAccuracy = unanswerable.length === 0
    ? null
    : unanswerable.filter((item) => item.returned.length === 0).length / unanswerable.length;
  const latencies = observations.map((item) => Number.isFinite(item.latencyMs) && item.latencyMs >= 0 ? item.latencyMs : 0);

  return Object.freeze({
    queryCount: observations.length,
    answerableQueryCount: answerable.length,
    unanswerableQueryCount: unanswerable.length,
    recallAtK: mean(recalls),
    precisionAtK: mean(precisions),
    citationPrecision,
    abstentionAccuracy,
    latencyP50Ms: median(latencies),
    latencyP95Ms: percentileNearestRank(latencies, 0.95),
  });
}
