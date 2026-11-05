import assert from "node:assert/strict";
import test from "node:test";
import { hasUsage, newLedger, recordAttempt } from "./b13-metering.mjs";

test("pure per-shop ledger aggregates provider counts and keeps failures separate", () => {
  const ledger = newLedger();
  recordAttempt(ledger, 1, { prompt_tokens: 7, completion_tokens: 2 }, true);
  recordAttempt(ledger, 2, { prompt_tokens: 11, completion_tokens: 3 }, true);
  recordAttempt(ledger, 2, null, false);
  recordAttempt(ledger, 3, null, true);
  assert.deepEqual([...ledger.values()], [
    { attempts: 1, settled: 1, inputTokens: 7, outputTokens: 2, unknownUsage: 0, failed: 0 },
    { attempts: 2, settled: 1, inputTokens: 11, outputTokens: 3, unknownUsage: 0, failed: 1 },
    { attempts: 1, settled: 1, inputTokens: 0, outputTokens: 0, unknownUsage: 1, failed: 0 },
  ]);
});

test("missing or malformed provider usage is never guessed", () => {
  assert.equal(hasUsage(undefined), false);
  assert.equal(hasUsage({ prompt_tokens: "5", completion_tokens: 2 }), false);
  const ledger = newLedger();
  recordAttempt(ledger, 1, { prompt_tokens: "5", completion_tokens: 2 }, true);
  assert.equal(ledger.get(1).unknownUsage, 1);
  assert.equal(ledger.get(1).inputTokens, 0);
});

test("unknown shop fails closed", () => {
  assert.throws(() => recordAttempt(newLedger(), 4, null, false), { message: "UNKNOWN_SYNTHETIC_SHOP" });
});
