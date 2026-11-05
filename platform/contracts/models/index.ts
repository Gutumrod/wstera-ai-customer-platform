export type ModelOperation = "answerability" | "grounded_answer";

export type ModelTokenUsage = Readonly<{
  workspaceId: string;
  providerId: string;
  model: string;
  operation: ModelOperation;
  /** null = the provider reported no usage; never estimated. */
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}>;

/** Persist usage without customer text, evidence, credentials, or raw provider payloads. */
export interface ModelUsagePort {
  /** Honor the signal where the persistence runtime supports cancellation. */
  record(usage: ModelTokenUsage, signal?: AbortSignal): Promise<void>;
}

export type ModelSpendLimits = Readonly<{
  /** Hard ceiling per workspace per UTC day, in millionths of the host's billing currency. */
  maxDailyCostMicros: number;
  /** Hard ceiling on provider calls per workspace per UTC day (every attempt counts, whatever the price). */
  maxDailyCalls: number;
}>;

export type ModelSpendReservation = Readonly<{
  workspaceId: string;
  conversationId: string | null;
  providerId: string;
  model: string;
  operation: ModelOperation;
  /** Worst-case cost of this call; counted against the ceiling until settled. May be 0 for flat-rate providers. */
  reserveCostMicros: number;
  limits: ModelSpendLimits;
}>;

export type ModelSpendReservationResult =
  | Readonly<{ kind: "reserved"; callId: string }>
  | Readonly<{ kind: "limit"; reason: "DAILY_COST_LIMIT" | "DAILY_CALL_LIMIT" }>;

/** Check-and-reserve before every provider call, so concurrent calls cannot overshoot the ceiling. Never stores text. */
export interface ModelSpendLedgerPort {
  reserve(reservation: ModelSpendReservation): Promise<ModelSpendReservationResult>;
  settle(input: Readonly<{ workspaceId: string; callId: string; usage: ModelTokenUsage; costMicros: number }>): Promise<void>;
  /** The call produced no usable result; the reserved worst case stays counted. */
  fail(input: Readonly<{ workspaceId: string; callId: string }>): Promise<void>;
}
