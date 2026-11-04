import assert from "node:assert/strict";
import test from "node:test";
import { createAnswerPort } from "./answer-port-factory.js";
import { ExtractiveAnswerAdapter } from "./extractive/extractive-answer-port.js";
import type { GroundedAnswerPort } from "../../modules/ai-engine/support-orchestrator.js";

test("factory default (undefined options) returns extractive port without calling createModelPort", () => {
  let modelPortCalls = 0;
  const port = createAnswerPort();

  assert.ok(port instanceof ExtractiveAnswerAdapter);
  assert.equal(modelPortCalls, 0);
});

test("factory with modelEnabled: false returns extractive port and does not call createModelPort", () => {
  let modelPortCalls = 0;
  const port = createAnswerPort({
    modelEnabled: false,
    createModelPort: () => {
      modelPortCalls += 1;
      return {} as GroundedAnswerPort;
    },
  });

  assert.ok(port instanceof ExtractiveAnswerAdapter);
  assert.equal(modelPortCalls, 0);
});

test("all non-boolean-true values for modelEnabled are treated as disabled and never invoke createModelPort", () => {
  const truthyNonBooleans = ["true", 1, {}, [], () => true, "1", "yes"];

  for (const candidate of truthyNonBooleans) {
    let calls = 0;
    const port = createAnswerPort({
      modelEnabled: candidate,
      createModelPort: () => {
        calls += 1;
        return {} as GroundedAnswerPort;
      },
    });

    assert.ok(port instanceof ExtractiveAnswerAdapter, `Expected extractive adapter for candidate: ${String(candidate)}`);
    assert.equal(calls, 0, `Expected 0 calls for candidate: ${String(candidate)}`);
  }
});

test("factory with modelEnabled: true invokes createModelPort and returns its instance", () => {
  let calls = 0;
  const mockModelPort: GroundedAnswerPort = {
    generate: async () => ({ text: "model-reply", citationRefs: ["m1"] }),
  };

  const port = createAnswerPort({
    modelEnabled: true,
    createModelPort: () => {
      calls += 1;
      return mockModelPort;
    },
  });

  assert.equal(calls, 1);
  assert.equal(port, mockModelPort);
});

test("factory with modelEnabled: true throws if createModelPort is not provided", () => {
  assert.throws(() => {
    createAnswerPort({
      modelEnabled: true,
    });
  }, TypeError);
});
