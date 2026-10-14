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

export interface VerifiedLineEvent {
  workspace: TrustedWorkspace;
  webhookEventId: string;
  userId: string;
  text: string;
  replyToken: string | null;
  timestamp: number;
}

export type ConnectionLookup = (destination: string) => Promise<LineConnection | null>;

export async function parseSignedLineTextEvents(
  rawBody: Uint8Array<ArrayBuffer>,
  signature: string | null | undefined,
  lookup: ConnectionLookup,
): Promise<VerifiedLineEvent[]> {
  if (!signature || rawBody.byteLength === 0 || rawBody.byteLength > 256 * 1024) {
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
  if (!isRecord(envelope) || typeof envelope.destination !== "string") {
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
  const accepted: VerifiedLineEvent[] = [];
  for (const item of envelope.events) {
    if (!isRecord(item) || item.type !== "message" || !isRecord(item.message)) continue;
    if (item.message.type !== "text" || typeof item.message.text !== "string") continue;
    if (!isRecord(item.source) || item.source.type !== "user" || typeof item.source.userId !== "string") continue;
    if (typeof item.webhookEventId !== "string" || item.webhookEventId.length === 0) continue;
    if (typeof item.timestamp !== "number" || !Number.isFinite(item.timestamp)) continue;
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
