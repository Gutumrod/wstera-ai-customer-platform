import type { GroundedAnswerPort, SupportEvidence } from "../../../modules/ai-engine/support-orchestrator.js";
import { isInjectionOrMarkup } from "./extractive-answerability-port.js";

export const MAX_EXTRACTIVE_EVIDENCE_ITEMS = 2;
export const MAX_EXTRACTIVE_CHARS = 2_000;

export type ExtractiveAnswerDraft = Readonly<{
  text: string;
  citationRefs: readonly string[];
}>;

function truncateSafely(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  let end = maxLen;
  const code = str.charCodeAt(end - 1);
  if (code >= 0xD800 && code <= 0xDBFF) {
    end -= 1;
  }
  return str.slice(0, end);
}

/**
 * Extractive answer port returning verbatim excerpts from approved evidence.
 * Screens untrusted evidence before display. Pattern matching is a heuristic,
 * not a guarantee against all prompt injection or harmful content.
 */
function displayableEvidence(text: string): string {
  const normalizedText = (value: string) => value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/gu, "");
  let displayText = text;
  if (/<!--|<(?:script|style)\b|<\/?[a-z][^>]*>/iu.test(text)) {
    displayText = text
      .replace(/<!--[\s\S]*?(?:-->|$)/gu, " ")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/giu, " ")
      .replace(/<[^>]*>/gu, " ")
      .split("\n").map((line) => line.replace(/[\t\f\v ]+/gu, " ").trim()).join("\n");
  }
  const segments = displayText.split(/\s+\/\s+|\r?\n/u), normalizedSegments = segments.map(normalizedText);
  if (!isInjectionOrMarkup(normalizedSegments.join("\n"))) return displayText;
  // Stop before the earliest segment containing any part of the instruction.
  let end = 0;
  for (; end < normalizedSegments.length; end += 1) {
    if (isInjectionOrMarkup(normalizedSegments.slice(0, end + 1).join("\n"))) break;
  }
  let start = end;
  if (!isInjectionOrMarkup(normalizedSegments[end] ?? "")) {
    for (let candidate = end - 1; candidate >= 0; candidate -= 1) {
      if (isInjectionOrMarkup(normalizedSegments.slice(candidate, end + 1).join("\n"))) {
        start = candidate;
        break;
      }
    }
  }
  return segments.slice(0, start).join("\n").trim();
}

export class ExtractiveAnswerAdapter implements GroundedAnswerPort {
  async generate(input: Readonly<{
    workspaceId: string;
    query: string;
    evidence: readonly SupportEvidence[];
  }>): Promise<ExtractiveAnswerDraft | null> {
    if (!input || !Array.isArray(input.evidence) || input.evidence.length === 0) {
      return null;
    }

    const selected: SupportEvidence[] = [];
    const seenRefs = new Set<string>();
    let totalLength = 0;

    for (const item of input.evidence) {
      if (!item || typeof item.text !== "string" || typeof item.referenceId !== "string") {
        continue;
      }
      const trimmedRef = item.referenceId.trim();
      if (trimmedRef.length === 0 || seenRefs.has(trimmedRef)) {
        continue;
      }

      const cleanText = displayableEvidence(item.text);
      const trimmed = cleanText.trim();
      if (trimmed.length === 0) {
        continue;
      }
      if (selected.length >= MAX_EXTRACTIVE_EVIDENCE_ITEMS) {
        break;
      }

      const separatorLength = selected.length > 0 ? 2 : 0;
      if (totalLength + separatorLength + cleanText.length > MAX_EXTRACTIVE_CHARS) {
        if (selected.length === 0) {
          // If the first evidence item exceeds the limit, take a bounded verbatim slice
          selected.push({
            ...item,
            referenceId: trimmedRef,
            text: truncateSafely(cleanText, MAX_EXTRACTIVE_CHARS),
          });
          seenRefs.add(trimmedRef);
        }
        break;
      }

      selected.push({
        ...item,
        referenceId: trimmedRef,
        text: cleanText,
      });
      seenRefs.add(trimmedRef);
      totalLength += separatorLength + cleanText.length;
    }

    if (selected.length === 0) {
      return null;
    }

    const text = selected.map((item) => item.text).join("\n\n");
    const citationRefs = Object.freeze(selected.map((item) => item.referenceId));

    return Object.freeze({
      text,
      citationRefs,
    });
  }
}

export function createExtractiveAnswerPort(): GroundedAnswerPort {
  return new ExtractiveAnswerAdapter();
}
