export type ModelOperation = "answerability" | "grounded_answer";

export type ModelTokenUsage = Readonly<{
  workspaceId: string;
  providerId: string;
  model: string;
  operation: ModelOperation;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}>;

/** Persist usage without customer text, evidence, credentials, or raw provider payloads. */
export interface ModelUsagePort {
  /** Honor the signal where the persistence runtime supports cancellation. */
  record(usage: ModelTokenUsage, signal?: AbortSignal): Promise<void>;
}
