/**
 * PromptPay EMVCo QR payload builder.
 *
 * Pure, provider-neutral domain logic: no I/O, no network, no dependencies, no state.
 * Adapted from the reviewed private source `line-oa-ai-sales-service-engine@739e649`
 * `src/core/utils/emvco-promptpay.ts` (Owner order 2026-10-25, D-20261025-02); re-implemented
 * here rather than copied, and the provenance table lives with the docs import, not this file.
 * The original sample phone numbers were not carried over; callers supply their own target.
 *
 * Scope limit: this builds the payload string only. Nothing here issues, charges, confirms or
 * verifies a payment, and no code path in this repository calls it yet.
 */

export type PromptPayErrorCode = "INVALID_TARGET" | "INVALID_AMOUNT";

export class PromptPayError extends Error {
  constructor(readonly code: PromptPayErrorCode) {
    super(code);
    this.name = "PromptPayError";
  }
}

export type PromptPayTarget = Readonly<{ tag: "01" | "02" | "03"; value: string }>;

export type PromptPayPayloadInput = Readonly<{ target: string; amountThb?: number }>;

/** EMVCo merchant-account AID for PromptPay (Bank of Thailand). */
const PROMPTPAY_AID = "A000000677010111";

/** Upper bound for a single PromptPay transfer, in THB. Guards against overflow in tag 54. */
const MAX_AMOUNT_THB = 99_999_999.99;

/** Encode one EMVCo TLV field: 2-digit tag, 2-digit decimal length, value. */
export function formatTlv(tag: string, value: string): string {
  if (!/^[0-9]{2}$/u.test(tag)) throw new TypeError("TLV_TAG_MUST_BE_TWO_DIGITS");
  if (value.length > 99) throw new TypeError("TLV_VALUE_TOO_LONG");
  return `${tag}${value.length.toString().padStart(2, "0")}${value}`;
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF) as 4 uppercase hex digits. */
export function crc16CcittHex(text: string): string {
  let crc = 0xffff;
  for (let index = 0; index < text.length; index += 1) {
    crc ^= text.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Normalise a PromptPay target into its EMVCo tag.
 * Accepted raw shapes only: digits, optionally prefixed with `+`. Separators, letters and trailing
 * junk are refused rather than stripped, so a typo cannot silently become a valid target.
 * 10-digit mobile starting with 0 -> tag 01 as 0066XXXXXXXXX
 * 11-digit mobile starting with 66 -> tag 01
 * 13-digit value already in 0066 form -> tag 01
 * other 13-digit value -> tag 02 (national/tax ID)
 * 15-digit e-Wallet ID -> tag 03
 */
export function formatPromptPayTarget(target: string): PromptPayTarget {
  if (!/^\+?[0-9]+$/u.test(target)) throw new PromptPayError("INVALID_TARGET");
  const digits = target.startsWith("+") ? target.slice(1) : target;
  if (digits.length === 10 && digits.startsWith("0")) {
    return Object.freeze({ tag: "01", value: `0066${digits.slice(1)}` });
  }
  if (digits.length === 11 && digits.startsWith("66")) {
    return Object.freeze({ tag: "01", value: `00${digits}` });
  }
  if (digits.length === 13 && digits.startsWith("0066")) {
    return Object.freeze({ tag: "01", value: digits });
  }
  if (digits.length === 13) return Object.freeze({ tag: "02", value: digits });
  if (digits.length === 15) return Object.freeze({ tag: "03", value: digits });
  throw new PromptPayError("INVALID_TARGET");
}

/**
 * Build the EMVCo payload string. Without `amountThb` the payload is a static QR (initiation
 * method 11); with it the payload carries amount tag 54 and initiation method 12.
 */
export function buildPromptPayPayload(input: PromptPayPayloadInput): string {
  const target = formatPromptPayTarget(input.target);

  let amountField = "";
  if (input.amountThb !== undefined) {
    const amount = input.amountThb;
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT_THB) {
      throw new PromptPayError("INVALID_AMOUNT");
    }
    const cents = Math.round(amount * 100);
    if (Math.abs(amount * 100 - cents) > 1e-6) throw new PromptPayError("INVALID_AMOUNT");
    const text = (cents / 100).toFixed(2);
    // Reject anything that is not plain decimal (toFixed on huge values yields exponent form).
    if (!/^[0-9]+\.[0-9]{2}$/u.test(text)) throw new PromptPayError("INVALID_AMOUNT");
    amountField = formatTlv("54", text);
  }

  const merchantAccountInfo = formatTlv("00", PROMPTPAY_AID) + formatTlv(target.tag, target.value);
  let payload = formatTlv("00", "01");
  payload += formatTlv("01", amountField === "" ? "11" : "12");
  payload += formatTlv("29", merchantAccountInfo);
  payload += formatTlv("53", "764");
  payload += amountField;
  payload += formatTlv("58", "TH");

  const withCrcTag = `${payload}6304`;
  return `${withCrcTag}${crc16CcittHex(withCrcTag)}`;
}
