import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPromptPayPayload,
  crc16CcittHex,
  formatPromptPayTarget,
  formatTlv,
  PromptPayError,
} from "./index.js";

const MOBILE = "0000000000";
const NATIONAL_ID = "0000000000000";
const E_WALLET = "000000000000000";
const GOLDEN_PAYLOAD = "00020101021229370016A000000677010111011300660000000005303764540539.505802TH63040FA5";

/** Parse top-level EMVCo TLVs so assertions do not depend on substring luck. */
function parseTlv(payload: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let index = 0;
  while (index < payload.length) {
    const tag = payload.slice(index, index + 2);
    const length = Number(payload.slice(index + 2, index + 4));
    fields[tag] = payload.slice(index + 4, index + 4 + length);
    index += 4 + length;
  }
  return fields;
}

test("TLV encoding writes tag, two-digit length and value", () => {
  assert.equal(formatTlv("00", "01"), "000201");
  assert.equal(formatTlv("58", "TH"), "5802TH");
  assert.equal(formatTlv("53", "764"), "5303764");
});

test("CRC matches the published CRC-16/CCITT-FALSE check value", () => {
  // Standard check value for this algorithm; independent of any payload this module builds.
  assert.equal(crc16CcittHex("123456789"), "29B1");
  assert.equal(crc16CcittHex(""), "FFFF");
});

test("CRC suffix matches a recomputation over the payload prefix", () => {
  const payload = buildPromptPayPayload({ target: MOBILE, amountThb: 1290 });
  const prefix = payload.slice(0, -4);
  assert.equal(crc16CcittHex(prefix), payload.slice(-4));
  assert.match(payload.slice(-4), /^[0-9A-F]{4}$/u);
});

test("payload without an amount is static and carries no amount tag", () => {
  const payload = buildPromptPayPayload({ target: MOBILE });
  const fields = parseTlv(payload);
  assert.equal(fields["00"], "01");
  assert.equal(fields["01"], "11");
  assert.equal(fields["53"], "764");
  assert.equal(fields["58"], "TH");
  assert.equal(fields["29"], "0016A00000067701011101130066000000000");
  assert.equal(Object.prototype.hasOwnProperty.call(fields, "54"), false);
  assert.ok(payload.startsWith("000201010211"));
});

test("payload with an amount is dynamic and carries tag 54 at two decimals", () => {
  const payload = buildPromptPayPayload({ target: MOBILE, amountThb: 1290 });
  const fields = parseTlv(payload);
  assert.equal(fields["01"], "12");
  assert.equal(fields["54"], "1290.00");
  assert.ok(payload.startsWith("000201010212"));
});

test("mobile target is normalised to 0066 form under tag 01", () => {
  assert.deepEqual({ ...formatPromptPayTarget(MOBILE) }, { tag: "01", value: "0066000000000" });
  assert.ok(buildPromptPayPayload({ target: MOBILE }).includes("01130066000000000"));
});

test("eleven-digit target already in 66 form gains the 00 prefix", () => {
  assert.deepEqual({ ...formatPromptPayTarget("66000000000") }, { tag: "01", value: "0066000000000" });
});

test("thirteen-digit target is used unchanged under tag 02", () => {
  assert.deepEqual({ ...formatPromptPayTarget(NATIONAL_ID) }, { tag: "02", value: NATIONAL_ID });
  assert.ok(buildPromptPayPayload({ target: NATIONAL_ID, amountThb: 500 }).includes("02130000000000000"));
});

test("thirteen-digit target already in 0066 form stays a mobile target", () => {
  assert.deepEqual({ ...formatPromptPayTarget("0066000000000") }, { tag: "01", value: "0066000000000" });
});

test("a plus-prefixed international mobile is accepted, other punctuation is not", () => {
  assert.deepEqual({ ...formatPromptPayTarget("+66000000000") }, { tag: "01", value: "0066000000000" });
  for (const target of ["081-234-5678", "081 234 5678", "0812345678x", "081.234.5678"]) {
    assert.throws(
      () => formatPromptPayTarget(target),
      (error: unknown) => error instanceof PromptPayError && error.code === "INVALID_TARGET",
    );
  }
});

test("fifteen-digit target is used unchanged under tag 03", () => {
  assert.deepEqual({ ...formatPromptPayTarget(E_WALLET) }, { tag: "03", value: E_WALLET });
});

test("non-positive, over-precise or oversized amounts are rejected", () => {
  for (const amountThb of [0, -1, 1.234, 1e22, 123456789012345.67, Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.throws(
      () => buildPromptPayPayload({ target: MOBILE, amountThb }),
      (error: unknown) => error instanceof PromptPayError && error.code === "INVALID_AMOUNT",
    );
  }
});

test("malformed targets are rejected instead of guessed", () => {
  for (const target of ["", "abc", "12345", "000000000", "0000000000000000000"]) {
    assert.throws(
      () => formatPromptPayTarget(target),
      (error: unknown) => error instanceof PromptPayError && error.code === "INVALID_TARGET",
    );
  }
});

test("payload matches a pinned vector computed outside this module", () => {
  // Built with a separate CRC16-CCITT implementation and TLV assembly, not by the code under
  // test. Fake target, never a real account.
  assert.equal(buildPromptPayPayload({ target: MOBILE, amountThb: 39.5 }), GOLDEN_PAYLOAD);
});

test("same input yields identical payload", () => {
  assert.equal(buildPromptPayPayload({ target: MOBILE, amountThb: 39.5 }), GOLDEN_PAYLOAD);
  assert.equal(buildPromptPayPayload({ target: MOBILE, amountThb: 39.5 }), GOLDEN_PAYLOAD);
});
