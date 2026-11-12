import { OpenAICompatibleChatAdapter } from "../adapters/models/openai-compatible/index.js";
import { createExtractiveAnswerPort } from "../adapters/answers/extractive/extractive-answer-port.js";
import {
  createGovernedModelAnswerPort,
  defaultModelPathLog,
  type ModelPathLog,
  type ModelPricing,
} from "../adapters/answers/model/governed-model-answer-port.js";
import type { ModelSpendLedgerPort, ModelSpendLimits, ModelUsagePort } from "../contracts/models/index.js";
import type { ChatHistoryItem, GroundedAnswerPort } from "../modules/ai-engine/support-orchestrator.js";
import { callWithOneRetry, isProviderFault } from "../adapters/models/openai-compatible/chat-completions.js";
import { selectSupportingEvidence } from "../adapters/answers/extractive/extractive-answerability-port.js";

/**
 * Environment (names only; values are the host's):
 *   AICP_MODEL_ANSWERS_ENABLED       must be exactly "true"
 *   AICP_MODEL_PROVIDER_ID           label stored in the ledger
 *   AICP_MODEL_BASE_URL              OpenAI-compatible base URL (https, or loopback http with AICP_MODEL_ALLOW_LOCAL_HTTP=true)
 *   AICP_MODEL_NAME, AICP_MODEL_API_KEY
 *   AICP_MODEL_PRICE_INPUT_PER_MTOK, AICP_MODEL_PRICE_OUTPUT_PER_MTOK   currency per million tokens, "0" allowed
 *   AICP_MODEL_DAILY_MAX_CALLS       per workspace per UTC day
 *   AICP_MODEL_DAILY_BUDGET          per workspace per UTC day, same currency; may be omitted only when both prices are "0"
 *   optional: AICP_MODEL_MAX_COMPLETION_TOKENS, AICP_MODEL_TIMEOUT_MS
 * Anything off, missing or invalid disables the model path and answers stay extractive.
 */
export type ModelPathSettings = Readonly<{
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  pricing: ModelPricing;
  limits: ModelSpendLimits;
  maxCompletionTokens: number;
  timeoutMs: number | undefined;
  allowLocalHttp: boolean;
}>;

type Env = Readonly<Record<string, string | undefined>>;

const decimal = /^\d{1,12}(\.\d{1,6})?$/;

function decimalValue(raw: string | undefined): number | null {
  return raw !== undefined && decimal.test(raw) ? Number(raw) : null;
}

function integerValue(raw: string | undefined, max: number): number | null {
  if (raw === undefined || !/^\d{1,9}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && value <= max ? value : null;
}

/** Returns null (with a reason-only log) unless the flag is on and every setting is present and valid. */
export function readModelPathSettings(env: Env, log: ModelPathLog = defaultModelPathLog): ModelPathSettings | null {
  if (env.AICP_MODEL_ANSWERS_ENABLED !== "true") return null;
  const disabled = (reason: string): null => {
    log("model_path.disabled", { reason });
    return null;
  };
  const providerId = env.AICP_MODEL_PROVIDER_ID;
  const baseUrl = env.AICP_MODEL_BASE_URL;
  const apiKey = env.AICP_MODEL_API_KEY;
  const model = env.AICP_MODEL_NAME;
  if (!providerId || !baseUrl || !apiKey || !model) return disabled("MISSING_PROVIDER_SETTINGS");
  const priceIn = decimalValue(env.AICP_MODEL_PRICE_INPUT_PER_MTOK);
  const priceOut = decimalValue(env.AICP_MODEL_PRICE_OUTPUT_PER_MTOK);
  if (priceIn === null || priceOut === null) return disabled("PRICING_NOT_SET");
  const maxCalls = integerValue(env.AICP_MODEL_DAILY_MAX_CALLS, 1_000_000);
  if (maxCalls === null) return disabled("DAILY_CALL_LIMIT_NOT_SET");
  let maxCostMicros: number;
  if (env.AICP_MODEL_DAILY_BUDGET === undefined && priceIn === 0 && priceOut === 0) {
    maxCostMicros = Number.MAX_SAFE_INTEGER; // every call costs 0, so the call ceiling is the only spend guard
  } else {
    const budget = decimalValue(env.AICP_MODEL_DAILY_BUDGET);
    if (budget === null) return disabled("DAILY_BUDGET_NOT_SET");
    maxCostMicros = Math.round(budget * 1_000_000);
  }
  const maxCompletionTokens = env.AICP_MODEL_MAX_COMPLETION_TOKENS === undefined ? 512 : integerValue(env.AICP_MODEL_MAX_COMPLETION_TOKENS, 8_192);
  if (maxCompletionTokens === null) return disabled("INVALID_MAX_COMPLETION_TOKENS");
  const timeoutMs = env.AICP_MODEL_TIMEOUT_MS === undefined ? undefined : integerValue(env.AICP_MODEL_TIMEOUT_MS, 120_000);
  if (timeoutMs === null) return disabled("INVALID_TIMEOUT");
  const settings: ModelPathSettings = Object.freeze({
    providerId, baseUrl, apiKey, model,
    pricing: Object.freeze({ inputMicrosPerToken: priceIn, outputMicrosPerToken: priceOut }),
    limits: Object.freeze({ maxDailyCostMicros: maxCostMicros, maxDailyCalls: maxCalls }),
    maxCompletionTokens,
    timeoutMs,
    allowLocalHttp: env.AICP_MODEL_ALLOW_LOCAL_HTTP === "true",
  });
  try {
    adapterFor(settings, { async record() {} }); // validates endpoint, key and model shape once at start-up
  } catch {
    return disabled("INVALID_PROVIDER_SETTINGS");
  }
  return settings;
}

function adapterFor(settings: ModelPathSettings, usage: ModelUsagePort, fetcher?: typeof fetch) {
  return new OpenAICompatibleChatAdapter({
    providerId: settings.providerId,
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    usage,
    maxCompletionTokens: settings.maxCompletionTokens,
    allowLocalHttp: settings.allowLocalHttp,
    ...(settings.timeoutMs !== undefined ? { timeoutMs: settings.timeoutMs } : {}),
    ...(fetcher ? { fetch: fetcher } : {}),
  });
}

/** Per-conversation factory for createWebChatHost's `model.createModelPort`. Extractive stays the fallback for everything. */
export function createModelPathFactory(options: Readonly<{
  settings: ModelPathSettings;
  ledger: ModelSpendLedgerPort;
  fetch?: typeof fetch;
  log?: ModelPathLog;
}>): (context: Readonly<{ conversationId: string }>) => GroundedAnswerPort {
  const extractive = createExtractiveAnswerPort();
  const fallback: GroundedAnswerPort = { async generate(input) {
    const evidence = selectSupportingEvidence(input.query, input.evidence);
    return evidence.length ? extractive.generate({ ...input, evidence }) : null;
  } };
  return (context) => createGovernedModelAnswerPort({
    providerId: options.settings.providerId,
    model: options.settings.model,
    conversationId: context.conversationId,
    ledger: options.ledger,
    limits: options.settings.limits,
    pricing: options.settings.pricing,
    maxCompletionTokens: options.settings.maxCompletionTokens,
    createModelPort: (usage) => adapterFor(options.settings, usage, options.fetch),
    fallback,
    ...(options.log ? { log: options.log } : {}),
  });
}

/** One separately reserved semantic triage call; malformed/provider/ledger failures fail closed. */
export function createModelGate(options: Readonly<{
  settings: ModelPathSettings; ledger: ModelSpendLedgerPort; fetch?: typeof fetch; log?: ModelPathLog;
}>): (input: Readonly<{ workspaceId: string; conversationId: string; query: string; evidence: readonly import("../modules/ai-engine/support-orchestrator.js").SupportEvidence[]; history?: readonly ChatHistoryItem[] }>) => Promise<unknown | null> {
  const log = options.log ?? defaultModelPathLog;
  return async (input) => {
    const bytes = new TextEncoder().encode(input.query + input.evidence.map((e) => e.text + e.sourceLabel).join("" )).byteLength;
    const reserveCostMicros = Math.ceil(2 * bytes * options.settings.pricing.inputMicrosPerToken
      + options.settings.maxCompletionTokens * options.settings.pricing.outputMicrosPerToken);
    let reservation;
    try { reservation = await options.ledger.reserve({ workspaceId: input.workspaceId, conversationId: input.conversationId,
      providerId: options.settings.providerId, model: options.settings.model, operation: "answerability",
      reserveCostMicros, limits: options.settings.limits }); }
    catch { log("model_path.triage_fallback", { reason: "LEDGER_UNAVAILABLE" }); return null; }
    if (reservation.kind === "limit") { log("model_path.triage_fallback", { reason: reservation.reason }); return null; }
    let settled = false;
    const usage: ModelUsagePort = { async record(value) {
      const costMicros = value.inputTokens === null || value.outputTokens === null ? reserveCostMicros
        : Math.ceil(value.inputTokens * options.settings.pricing.inputMicrosPerToken + value.outputTokens * options.settings.pricing.outputMicrosPerToken);
      await options.ledger.settle({ workspaceId: input.workspaceId, callId: reservation.callId, usage: value, costMicros }); settled = true;
    } };
    try {
      const adapter = adapterFor(options.settings, usage, options.fetch) as ReturnType<typeof adapterFor> & { triage(input: unknown): Promise<unknown> };
      return await callWithOneRetry(() => adapter.triage({ workspaceId: input.workspaceId, query: input.query, evidence: input.evidence, ...(input.history ? { history: input.history } : {}) }));
    } catch (error) {
      if (!settled) await options.ledger.fail({ workspaceId: input.workspaceId, callId: reservation.callId }).catch(() => undefined);
      log("model_path.triage_fallback", { reason: error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "UNEXPECTED" });
      // Provider still down after one retry: say so, so the brain does not mistake it for "no information".
      return isProviderFault(error) ? Object.freeze({ kind: "model_unavailable" }) : null;
    }
  };
}
