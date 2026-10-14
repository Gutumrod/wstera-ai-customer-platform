import { createTrustedWorkspace, type TrustedWorkspace } from "../core/workspace.js";
import { verifyLineSignature } from "./signature.js";

/**
 * The destination is untrusted until the signature is verified. It is only
 * a lookup key for the SERVER-STORED secret; not authorization to tenant data.
 * No DB, HTTP endpoint, queue or durable dedupe is implemented in this slice.
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

/**
 * Port for an atomic, durable event claim (for example a database unique
 * constraint). `true` means this delivery owns first processing; `false`
 * means the event was already claimed. No durable implementation is shipped.
 */
export interface LineEventDeduplicator {
  claimOnce(input: {
    workspaceId: string;
    connectionId: string;
    webhookEventId: string;
  }): Promise<boolean>;
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
  if (!signature || rawBody.byteLength === 0 || rawBody.byteLength > MAX_BODY_BYTES) {
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

/**
 * Ask a durable deduplicator to atomically claim each verified event before
 * processing it. This helper does not provide persistence on its own.
 */
export async function claimFirstLineDeliveries(
  events: readonly VerifiedLineEvent[],
  deduplicator: LineEventDeduplicator,
): Promise<VerifiedLineEvent[]> {
  const firstDeliveries: VerifiedLineEvent[] = [];
  for (const event of events) {
    const first = await deduplicator.claimOnce({
      workspaceId: event.workspace.workspaceId,
      connectionId: event.workspace.connectionId,
      webhookEventId: event.webhookEventId,
    });
    if (first) firstDeliveries.push(event);
  }
  return firstDeliveries;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
