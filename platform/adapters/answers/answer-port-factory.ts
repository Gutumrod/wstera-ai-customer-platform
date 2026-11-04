import type { GroundedAnswerPort } from "../../modules/ai-engine/support-orchestrator.js";
import { createExtractiveAnswerPort } from "./extractive/extractive-answer-port.js";

export type AnswerPortFactoryOptions = Readonly<{
  /** Explicit feature flag enabling model-backed port. Defaults to false. */
  modelEnabled?: boolean;
  createModelPort?: () => GroundedAnswerPort;
}>;

/**
 * Creates the GroundedAnswerPort implementation.
 * Defaults to extractive cited answers. The model-backed port is constructed
 * ONLY when modelEnabled is strictly true (boolean).
 */
export function createAnswerPort(options?: AnswerPortFactoryOptions): GroundedAnswerPort {
  if (options && options.modelEnabled === true) {
    if (typeof options.createModelPort !== "function") {
      throw new TypeError("createModelPort must be a function when modelEnabled is true");
    }
    return options.createModelPort();
  }
  return createExtractiveAnswerPort();
}
