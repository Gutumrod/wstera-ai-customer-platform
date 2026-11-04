import type { GroundedAnswerPort, SupportEvidence } from "../../../modules/ai-engine/support-orchestrator.js";

export const MAX_EXTRACTIVE_EVIDENCE_ITEMS = 2;
export const MAX_EXTRACTIVE_CHARS = 2_000;

export type ExtractiveAnswerDraft = Readonly<{
  text: string;
  citationRefs: readonly string[];
}>;

/**
 * Extractive answer port returning verbatim excerpts from approved evidence.
 * Evidence text is treated purely as untrusted data, never as instructions.
 */
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
    let totalLength = 0;

    for (const item of input.evidence) {
      if (!item || typeof item.text !== "string" || typeof item.referenceId !== "string") {
        continue;
      }
      const trimmed = item.text.trim();
      if (trimmed.length === 0) {
        continue;
      }
      if (selected.length >= MAX_EXTRACTIVE_EVIDENCE_ITEMS) {
        break;
      }

      const separatorLength = selected.length > 0 ? 2 : 0;
      if (totalLength + separatorLength + item.text.length > MAX_EXTRACTIVE_CHARS) {
        if (selected.length === 0) {
          // If the first evidence item exceeds the limit, take a bounded verbatim slice
          selected.push({
            ...item,
            text: item.text.slice(0, MAX_EXTRACTIVE_CHARS),
          });
        }
        break;
      }

      selected.push(item);
      totalLength += separatorLength + item.text.length;
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
