import type { ModelSpendLedgerPort, ModelSpendLimits, ModelUsagePort } from "../../../contracts/models/index.js";
import type { GroundedAnswerPort, SupportEvidence } from "../../../modules/ai-engine/support-orchestrator.js";

export type ModelPricing = Readonly<{
  /** Millionths of billing currency per token (numerically equal to currency per million tokens). 0 is allowed (flat-rate or unknown price). */
  inputMicrosPerToken: number;
  outputMicrosPerToken: number;
}>;

export type ModelPathLog = (event: string, fields: Readonly<Record<string, string | number>>) => void;

export const defaultModelPathLog: ModelPathLog = (event, fields) => {
  process.stderr.write(`${JSON.stringify({ level: "warn", event, ...fields })}\n`);
};

export type GovernedModelAnswerOptions = Readonly<{
  providerId: string;
  model: string;
  conversationId: string | null;
  ledger: ModelSpendLedgerPort;
  limits: ModelSpendLimits;
  pricing: ModelPricing;
  maxCompletionTokens: number;
  /** Builds the provider adapter around the per-call usage recorder. Provider and credentials stay with the caller. */
  createModelPort: (usage: ModelUsagePort) => GroundedAnswerPort;
  /** Serves every case the model path cannot (limit reached, provider failure, bad shape). */
  fallback: GroundedAnswerPort;
  log?: ModelPathLog;
}>;

const PROMPT_OVERHEAD_BYTES = 2_000;
const encoder = new TextEncoder();

/**
 * Upper bound of the call's cost: a token is at least one byte, JSON escaping at most doubles a character,
 * and output is capped by max_completion_tokens. Deliberately pessimistic so the ceiling is never exceeded.
 */
export function reserveCostMicros(
  query: string, evidence: readonly SupportEvidence[], maxCompletionTokens: number, pricing: ModelPricing,
): number {
  let bytes = encoder.encode(query).byteLength;
  for (const item of evidence) bytes += encoder.encode(item.text).byteLength + encoder.encode(item.sourceLabel).byteLength + encoder.encode(item.referenceId).byteLength;
  return Math.ceil((2 * bytes + PROMPT_OVERHEAD_BYTES) * pricing.inputMicrosPerToken + maxCompletionTokens * pricing.outputMicrosPerToken);
}

/**
 * Wraps a model-backed port with the ledger. Every provider call is reserved first; any refusal or failure
 * serves the extractive fallback instead and is logged by reason code only (never text or credentials).
 * No retry: a retry would be another reserved call against the same ceilings.
 */
export function createGovernedModelAnswerPort(options: GovernedModelAnswerOptions): GroundedAnswerPort {
  const log = options.log ?? defaultModelPathLog;
  return Object.freeze({
    async generate(input: Readonly<{ workspaceId: string; query: string; evidence: readonly SupportEvidence[] }>): Promise<unknown> {
      const fallback = (reason: string) => {
        log("model_path.fallback_extractive", { reason });
        return options.fallback.generate(input);
      };
      const reserved = reserveCostMicros(input.query, input.evidence, options.maxCompletionTokens, options.pricing);
      let reservation;
      try {
        reservation = await options.ledger.reserve({
          workspaceId: input.workspaceId,
          conversationId: options.conversationId,
          providerId: options.providerId,
          model: options.model,
          operation: "grounded_answer",
          reserveCostMicros: reserved,
          limits: options.limits,
        });
      } catch {
        return fallback("LEDGER_UNAVAILABLE");
      }
      if (reservation.kind === "limit") return fallback(reservation.reason);
      const { callId } = reservation;
      let settled = false;
      const usage: ModelUsagePort = {
        async record(value) {
          // Real tokens are always stored. With no usage reported the reserved worst case stays counted.
          const costMicros = value.inputTokens === null || value.outputTokens === null
            ? reserved
            : Math.ceil(value.inputTokens * options.pricing.inputMicrosPerToken + value.outputTokens * options.pricing.outputMicrosPerToken);
          await options.ledger.settle({ workspaceId: input.workspaceId, callId, usage: value, costMicros });
          settled = true;
        },
      };
      try {
        return await options.createModelPort(usage).generate(input);
      } catch (error) {
        if (!settled) await options.ledger.fail({ workspaceId: input.workspaceId, callId }).catch(() => undefined);
        const code = typeof error === "object" && error !== null && (error as { name?: unknown }).name === "ModelAdapterError"
          ? String((error as { code?: unknown }).code) : "UNEXPECTED";
        return fallback(`MODEL_${code}`);
      }
    },
  });
}
