import type {
  AnswerabilityAssessment,
  AnswerabilityPort,
  SupportEvidence,
} from "../../../modules/ai-engine/support-orchestrator.js";
import { analyzeText } from "../../../modules/knowledge/index.js";

/**
 * Minimum share of the question's key terms that one evidence item must
 * contain before an extractive answer is allowed. Tuned against the Thai
 * answerability table in `extractive-answerability-port.test.ts`; when in
 * doubt this port refuses rather than answers (fail closed).
 */
export const MIN_QUERY_TERM_COVERAGE = 0.4;

/** A single matching bigram/SKU is not enough for a multi-term question. */
export const MIN_MATCHED_KEY_TERMS = 2;

/** Retrieval caps questions at 500 characters before answerability runs. */
export const MAX_ANSWERABILITY_QUERY_CHARS = 500;

const MAX_EVIDENCE_TEXT_CHARS = 20_000;

const thaiBigramPattern = /^[\u0E00-\u0E7F]{2}$/u;
const latinTermPattern = /^[a-z0-9]+(?:[-_./][a-z0-9]+)*$/u;
const digitsOnlyPattern = /^[0-9]+$/u;
const skuLikePattern = /^(?=.*[a-z])(?=.*\d)[a-z0-9]+(?:[-_./][a-z0-9]+)*$/u;
const markupPattern = /<\s*\/?\s*[a-z][^>]*>/iu;

/**
 * Instruction-smuggling phrases are treated as untrusted instructions, not as
 * questions about the shop. They never reach the extractive answer path.
 */
const instructionPatterns: readonly RegExp[] = Object.freeze([
  /\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+instructions?\b/iu,
  /\bdisregard\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?)\b/iu,
  /\b(?:reveal|show|print|output)\s+(?:the\s+)?(?:system|developer|hidden)\s+prompt\b/iu,
  /\byou\s+are\s+now\s+(?:an?\s+)?(?:admin|administrator|system)\b/iu,
  /(?:เพิกเฉย|ลืม|ข้าม)\s*(?:คำสั่ง|คําสั่ง)(?:ทั้งหมด|ก่อนหน้า)?/u,
  /(?:เปิดเผย|แสดง|บอก)\s*(?:system\s*prompt|พรอมป์ตระบบ|คำสั่งระบบ)/iu,
]);

type KeyTermAnalysis = Readonly<{
  terms: ReadonlySet<string>;
  numericTerms: ReadonlySet<string>;
  compactSkuKeys: ReadonlySet<string>;
}>;

function compactSku(code: string): string {
  return code.replace(/[-_./]/gu, "");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Reuses the retrieval analyzer but keeps only term shapes that are stable
 * across Thai spacing: Thai character bigrams and Latin/SKU word forms. Whole
 * unspaced Thai runs are phrases, so they are not counted as key terms;
 * digits alone are weak signals and must never justify an answer.
 */
function analyzeKeyTerms(text: string): KeyTermAnalysis {
  const analysis = analyzeText(text);
  const terms = new Set<string>();
  const numericTerms = new Set<string>();
  for (const term of analysis.terms) {
    if (digitsOnlyPattern.test(term)) {
      numericTerms.add(term);
      continue;
    }
    if (thaiBigramPattern.test(term) || latinTermPattern.test(term)) terms.add(term);
  }
  return Object.freeze({
    terms,
    numericTerms,
    compactSkuKeys: Object.freeze(new Set(analysis.skuCodes.map(compactSku))),
  });
}

function isInjectionOrMarkup(query: string): boolean {
  if (markupPattern.test(query)) return true;
  return instructionPatterns.some((pattern) => pattern.test(query));
}

function countMatchedKeyTerms(query: KeyTermAnalysis, evidence: KeyTermAnalysis): number {
  let matched = 0;
  for (const term of query.terms) {
    if (evidence.terms.has(term)) {
      matched += 1;
      continue;
    }
    // Retrievers already accept compact SKU variants (e.g. "ZX650" for "ZX-650").
    if (skuLikePattern.test(term) && evidence.compactSkuKeys.has(compactSku(term))) matched += 1;
  }
  return matched;
}

/** Provider-neutral, network-free answerability gate for extractive answers. */
export class ExtractiveAnswerabilityAdapter implements AnswerabilityPort {
  async assess(input: Readonly<{
    workspaceId: string;
    query: string;
    evidence: readonly SupportEvidence[];
  }>): Promise<AnswerabilityAssessment> {
    try {
      return assessExtractiveAnswerability(input);
    } catch {
      // Untrusted getters, malformed values and unexpected runtime shapes must
      // never escape as exceptions or as an answer.
      return Object.freeze({ kind: "uncertain" });
    }
  }
}

function assessExtractiveAnswerability(input: unknown): AnswerabilityAssessment {
  if (!isPlainRecord(input)) return Object.freeze({ kind: "uncertain" });
  const workspaceId = input.workspaceId;
  const query = input.query;
  const rawEvidence = input.evidence;
  if (typeof workspaceId !== "string" || workspaceId.trim().length === 0) return Object.freeze({ kind: "uncertain" });
  if (typeof query !== "string") return Object.freeze({ kind: "uncertain" });
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0 || trimmedQuery.length > MAX_ANSWERABILITY_QUERY_CHARS) {
    return Object.freeze({ kind: "uncertain" });
  }
  if (isInjectionOrMarkup(trimmedQuery)) return Object.freeze({ kind: "uncertain" });
  if (!Array.isArray(rawEvidence)) return Object.freeze({ kind: "uncertain" });
  if (rawEvidence.length === 0) return Object.freeze({ kind: "insufficient_evidence" });

  const evidenceTexts: string[] = [];
  for (const item of rawEvidence) {
    if (!isPlainRecord(item)
      || typeof item.referenceId !== "string" || item.referenceId.trim().length === 0
      || typeof item.text !== "string" || item.text.length > MAX_EVIDENCE_TEXT_CHARS) {
      return Object.freeze({ kind: "uncertain" });
    }
    const text = item.text.trim();
    if (text.length > 0) evidenceTexts.push(text);
  }
  if (evidenceTexts.length === 0) return Object.freeze({ kind: "insufficient_evidence" });

  const queryAnalysis = analyzeKeyTerms(trimmedQuery);
  if (queryAnalysis.terms.size === 0) return Object.freeze({ kind: "uncertain" });

  let bestCoverage = 0;
  let bestMatched = 0;
  for (const text of evidenceTexts) {
    const matched = countMatchedKeyTerms(queryAnalysis, analyzeKeyTerms(text));
    const coverage = matched / queryAnalysis.terms.size;
    if (coverage > bestCoverage || (coverage === bestCoverage && matched > bestMatched)) {
      bestCoverage = coverage;
      bestMatched = matched;
    }
  }

  const coversEnough = bestCoverage >= MIN_QUERY_TERM_COVERAGE
    && (bestMatched >= MIN_MATCHED_KEY_TERMS || bestMatched === queryAnalysis.terms.size);
  return Object.freeze({ kind: coversEnough ? "answerable" : "insufficient_evidence" });
}

export function createExtractiveAnswerabilityPort(): AnswerabilityPort {
  return new ExtractiveAnswerabilityAdapter();
}
