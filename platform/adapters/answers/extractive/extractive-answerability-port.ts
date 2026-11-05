import type {
  AnswerabilityAssessment,
  AnswerabilityPort,
  SupportEvidence,
} from "../../../modules/ai-engine/support-orchestrator.js";
import { analyzeText } from "../../../modules/knowledge/index.js";

/**
 * Minimum share of the question's key terms that one evidence item must
 * contain before an extractive answer is allowed. Tuned against the table in
 * `extractive-answerability-port.test.ts`: questions that answer cleanly sit at
 * 0.9-1.0, while questions that only ride along on one shared topic stay at
 * 0.78 or below. When in doubt this port refuses rather than answers.
 */
export const MIN_QUERY_TERM_COVERAGE = 0.8;

/** A single matching bigram/SKU is not enough for a multi-term question. */
export const MIN_MATCHED_KEY_TERMS = 2;

/**
 * A question must say more than one bare topic word. `Intl.Segmenter("th")`
 * cuts a bare topic ("จัดส่ง") into 2 words and a plain statement-shaped
 * question ("ค่าจัดส่ง") into 3, so a question with no question word needs at
 * least this many distinct content words. A question that carries a question
 * word (ไหน, บ้าง, กี่, เท่าไหร่ ...) or names a product code is exempt: the
 * question word says it is a question and the code identifies the subject.
 */
export const MIN_QUERY_KEY_TERMS = 3;

/** Retrieval caps questions at 500 characters before answerability runs. */
export const MAX_ANSWERABILITY_QUERY_CHARS = 500;

const MAX_EVIDENCE_TEXT_CHARS = 20_000;

const zeroWidthPattern = /[\u200B-\u200D\uFEFF]/gu;
const thaiRunPattern = /[\u0E00-\u0E7F]+/gu;
const tokenPattern = /[a-z0-9]+(?:[-_./][a-z0-9]+)*|[\u0E00-\u0E7F]+/gu;
const thaiSegmenter = new Intl.Segmenter("th", { granularity: "word" });
const latinTermPattern = /^[a-z0-9]+(?:[-_./][a-z0-9]+)*$/u;
const digitsOnlyPattern = /^[0-9]+$/u;
const skuLikePattern = /^(?=.*[a-z])(?=.*\d)[a-z0-9]+(?:[-_./][a-z0-9]+)*$/u;
const markupPattern = /<\s*\/?\s*[a-z][^>]*>/iu;

/**
 * Prompt-injection screening is an EARLY HEURISTIC ONLY, not a defence.
 *
 * The extractive answer path never executes instructions: evidence text is
 * copied verbatim as DATA and no model reads it, so the answer's safety comes
 * from the shape of the pipeline, not from this list. The list is deliberately
 * NOT expanded to chase phrasing. It must not be relied on if a model-backed
 * answer port is ever enabled — such a port needs its own instruction/response
 * hardening instead.
 */
const instructionPatterns: readonly RegExp[] = Object.freeze([
  /\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+instructions?\b/iu,
  /\bdisregard\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?)\b/iu,
  /\b(?:reveal|show|print|output)\s+(?:the\s+)?(?:system|developer|hidden)\s+prompt\b/iu,
  /\byou\s+are\s+now\s+(?:an?\s+)?(?:admin|administrator|system)\b/iu,
  /(?:เพิกเฉย|ลืม|ข้าม)\s*(?:คำสั่ง|คําสั่ง)(?:ทั้งหมด|ก่อนหน้า)?/u,
  /(?:เปิดเผย|แสดง|บอก)\s*(?:system\s*prompt|พรอมป์ตระบบ|คำสั่งระบบ)/iu,
]);

/**
 * Thai politeness, question and request-framing words. They carry tone, not
 * topic, so leaving them in the denominator would make a perfectly ordinary
 * polite question look like it asks about ครับ/ค่ะ/เท่าไหร่. They are removed as
 * substrings (longest first) because Thai is written without word spaces; every
 * entry here is long enough not to sit inside a shop-domain word.
 */
const THAI_NON_CONTENT_PHRASES: readonly string[] = Object.freeze([
  "หรือเปล่า",
  "หรือไม่",
  "ต้องการทราบ",
  "อยากทราบ",
  "ได้ไหม",
  "เท่าไหร่",
  "เท่าไร",
  "กี่โมง",
  "กี่บาท",
  "อย่างไร",
  "ยังไง",
  "ทำไม",
  "ที่ไหน",
  "นานแค่ไหน",
  "นานเท่าไหร่",
  "นานเท่าไร",
  "แค่ไหน",
  "ไหน",
  "บ้าง",
  "เมื่อไหร่",
  "ขอทราบ",
  "สอบถาม",
  "ช่วยบอก",
  "อยากรู้",
  "โปรด",
  "บอก",
  "แจ้ง",
  "ช่วย",
  "หน่อย",
  "อะไร",
  "ใคร",
  "ไหม",
  "หรือ",
  "กี่",
]);

/**
 * Particles that also occur inside content words ("สิ" inside "สินค้า", "คะ"
 * inside "คะแนน"), so they are only removed at the edge of a Thai run.
 */
const THAI_EDGE_PARTICLES: readonly string[] = Object.freeze([
  "ครับผม",
  "ครับ",
  "ค่ะ",
  "คะ",
  "นะ",
  "สิ",
  "จ้ะ",
  "จ้า",
  "ฮะ",
  "เอ่ย",
]);

/** English function words; same idea as the Thai list above. */
const LATIN_NON_CONTENT_TERMS: ReadonlySet<string> = new Set([
  "a", "about", "an", "and", "any", "are", "at", "be", "but", "can", "could", "did", "do", "does",
  "for", "from", "hello", "here", "hi", "how", "i", "in", "is", "it", "many", "me", "much", "my",
  "of", "on", "or", "our", "please", "pls", "should", "some", "thank", "thanks", "that", "the",
  "there", "these", "this", "those", "to", "was", "we", "were", "what", "when", "where", "which",
  "who", "why", "will", "with", "would", "you",
]);

const sortedThaiNonContentPhrases = Object.freeze(
  [...THAI_NON_CONTENT_PHRASES].sort((a, b) => b.length - a.length),
);
const sortedThaiEdgeParticles = Object.freeze(
  [...THAI_EDGE_PARTICLES].sort((a, b) => b.length - a.length),
);

/** Whole-word fillers left after segmentation ("ได้", "มี", "ทาง" carry no topic). */
const THAI_STOP_WORDS: ReadonlySet<string> = new Set(["ได้", "มี", "ทาง"]);

/** Question words: they make a short question a question, but are never topic terms. */
const questionWordPattern = /ไหม|หรือ|เท่าไ(?:หร่|ร)|กี่|อะไร|ใคร|ไหน|บ้าง|ยังไง|อย่างไร|ทำไม|เมื่อไหร่/u;

type KeyTermAnalysis = Readonly<{
  /** Latin words and product codes. */
  terms: ReadonlySet<string>;
  /** Thai words from Intl.Segmenter, compared with the document as substrings. */
  thaiWords: ReadonlySet<string>;
  skuKeys: ReadonlySet<string>;
  asksQuestion: boolean;
}>;

const EMPTY_SELECTION: readonly SupportEvidence[] = Object.freeze([]);

function compactSku(code: string): string {
  return code.replace(/[-_./]/gu, "");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** NFKC folds full-width forms ("ＺＸ－６５０" -> "zx-650"); zero-width marks vanish. */
function normalizeForAnalysis(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("th-TH").replace(zeroWidthPattern, "");
}

function stripEdgeParticles(run: string): string {
  let current = run;
  let changed = true;
  while (changed && current.length > 0) {
    changed = false;
    for (const particle of sortedThaiEdgeParticles) {
      if (current.length >= particle.length && current.startsWith(particle)) {
        current = current.slice(particle.length);
        changed = true;
        break;
      }
      if (current.length >= particle.length && current.endsWith(particle)) {
        current = current.slice(0, current.length - particle.length);
        changed = true;
        break;
      }
    }
  }
  return current;
}

/** Removes tone-only words so the coverage denominator counts content only. */
function stripNonContentTerms(text: string): string {
  let current = text;
  for (const phrase of sortedThaiNonContentPhrases) {
    if (current.includes(phrase)) current = current.split(phrase).join(" ");
  }
  return current.replace(thaiRunPattern, (run) => stripEdgeParticles(run));
}

/**
 * Reuses the retrieval analyzer for Latin words and product codes only; digits
 * alone are weak signals and never justify an answer. Thai words come from
 * `analyzeQueryTerms`, because retrieval's character bigrams count the seams
 * between words and punish short questions.
 */
function analyzeKeyTerms(text: string): KeyTermAnalysis {
  const analysis = analyzeText(normalizeForAnalysis(text));
  const terms = new Set<string>();
  for (const term of analysis.terms) {
    if (!digitsOnlyPattern.test(term) && latinTermPattern.test(term)) terms.add(term);
  }
  return Object.freeze({
    terms,
    thaiWords: new Set<string>(),
    skuKeys: Object.freeze(new Set(analysis.skuCodes.map(compactSku))),
    asksQuestion: false,
  });
}

function analyzeQueryTerms(query: string): KeyTermAnalysis {
  const normalized = normalizeForAnalysis(query);
  const base = analyzeKeyTerms(stripNonContentTerms(normalized));
  const thaiWords = new Set<string>();
  for (const run of stripNonContentTerms(normalized).match(thaiRunPattern) ?? []) {
    for (const part of thaiSegmenter.segment(run)) {
      if (part.isWordLike && part.segment.length >= 2 && !THAI_STOP_WORDS.has(part.segment)) thaiWords.add(part.segment);
    }
  }
  return Object.freeze({ ...base, thaiWords, asksQuestion: questionWordPattern.test(normalized) });
}

export function isInjectionOrMarkup(query: string): boolean {
  if (markupPattern.test(query)) return true;
  return instructionPatterns.some((pattern) => pattern.test(query));
}

type EvidenceMatch = Readonly<{
  coverage: number;
  matched: number;
  containsQuerySkus: boolean;
}>;

function termCount(query: KeyTermAnalysis): number {
  return query.terms.size + query.thaiWords.size;
}

function matchEvidence(query: KeyTermAnalysis, text: string, label: string): EvidenceMatch {
  // The document title is shop data too ("วิธีชำระเงิน"); the answer itself is still quoted from `text` only.
  const searchable = `${text} ${label}`;
  const evidence = analyzeKeyTerms(searchable);
  const haystack = normalizeForAnalysis(searchable);
  let matched = 0;
  for (const term of query.terms) {
    if (evidence.terms.has(term)) {
      matched += 1;
      continue;
    }
    // Retrievers already accept compact SKU variants (e.g. "ZX650" for "ZX-650").
    if (skuLikePattern.test(term) && evidence.skuKeys.has(compactSku(term))) matched += 1;
  }
  for (const word of query.thaiWords) {
    if (haystack.includes(word)) matched += 1;
  }
  let containsQuerySkus = true;
  for (const sku of query.skuKeys) {
    if (!evidence.skuKeys.has(sku)) {
      containsQuerySkus = false;
      break;
    }
  }
  const total = termCount(query);
  return Object.freeze({
    coverage: total === 0 ? 0 : matched / total,
    matched,
    containsQuerySkus,
  });
}

/**
 * The one notion of "supporting evidence" shared by the answerability gate and
 * the answer port: an evidence item qualifies when it covers at least
 * `MIN_QUERY_TERM_COVERAGE` of the question's content terms (and at least two
 * distinct terms), every product code named by the question is present in the
 * item, and the question is specific enough to have a subject at all. Results
 * are ordered by relevance. Never throws; unusable input selects nothing.
 */
export function selectSupportingEvidence(
  query: unknown,
  evidence: unknown,
): readonly SupportEvidence[] {
  try {
    if (typeof query !== "string") return EMPTY_SELECTION;
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0 || trimmedQuery.length > MAX_ANSWERABILITY_QUERY_CHARS) return EMPTY_SELECTION;
    if (isInjectionOrMarkup(trimmedQuery)) return EMPTY_SELECTION;
    if (!Array.isArray(evidence)) return EMPTY_SELECTION;

    const queryAnalysis = analyzeQueryTerms(trimmedQuery);
    const queryTermCount = termCount(queryAnalysis);
    if (queryTermCount === 0) return EMPTY_SELECTION;
    const singleSkuQuestion = queryTermCount === 1 && queryAnalysis.skuKeys.size === 1;
    // A named product code identifies the subject on its own; a question word
    // makes a short question a question.
    const specificEnough = singleSkuQuestion
      || queryAnalysis.skuKeys.size > 0
      || (queryAnalysis.asksQuestion ? queryTermCount >= 1 : queryTermCount >= MIN_QUERY_KEY_TERMS);
    if (!specificEnough) return EMPTY_SELECTION;

    const scored: Array<Readonly<{ item: SupportEvidence; coverage: number; matched: number; index: number }>> = [];
    const items = evidence as readonly unknown[];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!isPlainRecord(item)) continue;
      const referenceId = item.referenceId;
      const rawText = item.text;
      if (typeof referenceId !== "string" || referenceId.trim().length === 0) continue;
      if (typeof rawText !== "string" || rawText.length > MAX_EVIDENCE_TEXT_CHARS) continue;
      const text = rawText.trim();
      if (text.length === 0) continue;

      const match = matchEvidence(queryAnalysis, text, typeof item.sourceLabel === "string" ? item.sourceLabel : "");
      if (!match.containsQuerySkus) continue;
      const matchedEnough = match.matched >= MIN_MATCHED_KEY_TERMS
        || (singleSkuQuestion && match.matched === 1);
      if (!matchedEnough || match.coverage < MIN_QUERY_TERM_COVERAGE) continue;
      scored.push(Object.freeze({ item: item as unknown as SupportEvidence, ...match, index }));
    }

    scored.sort((left, right) => right.coverage - left.coverage
      || right.matched - left.matched
      || left.index - right.index);
    return Object.freeze(scored.map((entry) => entry.item));
  } catch {
    return EMPTY_SELECTION;
  }
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

  const evidence: SupportEvidence[] = [];
  for (const item of rawEvidence) {
    if (!isPlainRecord(item)
      || typeof item.referenceId !== "string" || item.referenceId.trim().length === 0
      || typeof item.text !== "string" || item.text.length > MAX_EVIDENCE_TEXT_CHARS) {
      return Object.freeze({ kind: "uncertain" });
    }
    const text = item.text.trim();
    if (text.length > 0) {
      evidence.push(Object.freeze({
        referenceId: item.referenceId.trim(),
        sourceLabel: typeof item.sourceLabel === "string" ? item.sourceLabel : "",
        text,
      }));
    }
  }
  if (evidence.length === 0) return Object.freeze({ kind: "insufficient_evidence" });
  if (termCount(analyzeQueryTerms(trimmedQuery)) === 0) return Object.freeze({ kind: "uncertain" });

  const selected = selectSupportingEvidence(trimmedQuery, evidence);
  return Object.freeze({ kind: selected.length > 0 ? "answerable" : "insufficient_evidence" });
}

export function createExtractiveAnswerabilityPort(): AnswerabilityPort {
  return new ExtractiveAnswerabilityAdapter();
}
