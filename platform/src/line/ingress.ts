import { createTrustedWorkspace, type TrustedWorkspace } from "../core/workspace.js";
import { verifyLineSignature } from "./signature.js";

/**
 * The destination is untrusted until the signature is verified. It is only
 * a lookup key for the SERVER-STORED secret; not authorization to tenant data.
 * The unsigned URL-test probe path below emits no events and creates no tenant
 * context. No DB, HTTP endpoint, queue or durable dedupe is implemented here.
 */
export interface LineConnection {
  workspaceId: string;
  connectionId: string;
  channelSecret: string;
}

/**
 * Resolve an untrusted LINE destination to a server-owned connection. An
 * implementation must only return connections the server has explicitly
 * associated with that destination.
 */
export type LineConnectionLookup = (destination: string) => Promise<LineConnection | null>;

export interface VerifiedLineEvent {
  workspace: TrustedWorkspace;
  webhookEventId: string;
  userId: string;
  text: string;
  replyToken: string | null;
  timestamp: number;
}

export type LineEventKey = Readonly<{
  workspaceId: string;
  connectionId: string;
  webhookEventId: string;
}>;

export type LineEventLease = Readonly<{
  /** Opaque fencing token; only its current owner may complete or release it. */
  leaseToken: string;
  /** Expiry according to the store's clock, after which another delivery may claim. */
  expiresAt: number;
}>;

/**
 * Port for durable event processing state. `claim` must atomically return a
 * lease only for unseen or expired, non-completed events. A duplicate with an
 * active lease or completed state returns null. Crashed workers become
 * retryable after lease expiry. A worker should release a lease after a
 * recoverable processing failure and complete only after durable effects.
 * Processing is at-least-once: side effects must be idempotent because a
 * worker can fail after an effect but before completion. Implementations must
 * fence stale lease tokens. No durable implementation is shipped.
 */
export interface LineEventDeduplicator {
  claim(input: LineEventKey): Promise<LineEventLease | null>;
  complete(input: LineEventKey & { leaseToken: string }): Promise<void>;
  releaseForRetry(input: LineEventKey & { leaseToken: string }): Promise<void>;
}

const destinationPattern = /^U[a-f0-9]{32}$/i;
const userIdPattern = /^U[a-f0-9]{32}$/i;
const eventIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_EVENTS = 100;
const MAX_TEXT_LENGTH = 5000;
const MAX_REPLY_TOKEN_LENGTH = 512;

export async function parseSignedLineTextEvents(
  rawBody: Uint8Array<ArrayBuffer>,
  signature: string | null | undefined,
  lookup: LineConnectionLookup,
): Promise<VerifiedLineEvent[]> {
  if (rawBody.byteLength === 0 || rawBody.byteLength > MAX_BODY_BYTES) {
    throw new Error("INVALID_LINE_WEBHOOK");
  }

  // Parse the JSON for untrusted destination lookup, but validate HMAC
  // against ORIGINAL bytes before producing any authenticated event.
  let envelope: unknown;
  try {
    envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    throw new Error("INVALID_LINE_PAYLOAD");
  }
  // LINE's URL communication test may be an unsigned empty-event POST with a
  // placeholder destination. It has no tenant context or side effects, so
  // acknowledge only this exact bounded envelope without weakening event auth.
  if (!signature && isLineUrlVerificationProbe(envelope)) return [];
  if (!signature) throw new Error("INVALID_LINE_WEBHOOK");
  if (!isRecord(envelope) || typeof envelope.destination !== "string" || !destinationPattern.test(envelope.destination)) {
    throw new Error("INVALID_LINE_DESTINATION");
  }
  const connection = await lookup(envelope.destination);
  if (!connection) throw new Error("UNKNOWN_LINE_CONNECTION");
  if (!(await verifyLineSignature(rawBody, signature, connection.channelSecret))) {
    throw new Error("INVALID_LINE_SIGNATURE");
  }
  const workspace = createTrustedWorkspace({
    workspaceId: connection.workspaceId,
    connectionId: connection.connectionId,
    channel: "line",
  });
  if (!Array.isArray(envelope.events)) throw new Error("INVALID_LINE_EVENTS");
  if (envelope.events.length > MAX_EVENTS) throw new Error("TOO_MANY_LINE_EVENTS");
  const accepted: VerifiedLineEvent[] = [];
  for (const item of envelope.events) {
    if (!isRecord(item)) throw new Error("INVALID_LINE_EVENT");
    // Valid but unsupported LINE event types are intentionally ignored.
    if (item.type !== "message") continue;
    if (!isRecord(item.message) || item.message.type !== "text") continue;
    if (!isRecord(item.source) || item.source.type !== "user") continue;
    if (
      typeof item.source.userId !== "string" || !userIdPattern.test(item.source.userId) ||
      typeof item.webhookEventId !== "string" || !eventIdPattern.test(item.webhookEventId) ||
      typeof item.timestamp !== "number" || !Number.isSafeInteger(item.timestamp) || item.timestamp < 0 ||
      typeof item.message.text !== "string" || item.message.text.length === 0 || item.message.text.length > MAX_TEXT_LENGTH ||
      (item.replyToken !== undefined && (typeof item.replyToken !== "string" || item.replyToken.length === 0 || item.replyToken.length > MAX_REPLY_TOKEN_LENGTH))
    ) {
      throw new Error("INVALID_LINE_EVENT");
    }
    accepted.push({
      workspace,
      webhookEventId: item.webhookEventId,
      userId: item.source.userId,
      text: item.message.text,
      replyToken: typeof item.replyToken === "string" ? item.replyToken : null,
      timestamp: item.timestamp,
    });
  }
  return accepted;
}

function isLineUrlVerificationProbe(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 2 &&
    keys.includes("destination") && keys.includes("events") &&
    typeof value.destination === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value.destination) &&
    Array.isArray(value.events) && value.events.length === 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
