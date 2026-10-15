/**
 * Shared channel boundary contracts. These values describe a normalized
 * transport event; they never establish workspace authorization by themselves.
 */
import type { ChannelId } from "../tenancy/index.js";

export type Channel = ChannelId;

/** @deprecated Import this type from contracts/tenancy instead. */
export type { TrustedWorkspaceContext } from "../tenancy/index.js";

/** Provider-neutral customer message. User and message IDs are scoped to connectionId. */
export type InboundMessage = Readonly<{
  channel: Channel;
  connectionId: string;
  externalMessageId: string;
  externalUserId: string;
  receivedAt: string;
  text: string;
}>;

/** Outbound channel capability. Implementations must reject on delivery failure. */
export interface ChannelPort {
  send(input: {
    workspaceId: string;
    connectionId: string;
    threadId: string;
    text: string;
  }): Promise<void>;
}

export type ChannelErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "TEMPORARY_UNAVAILABLE"
  | "PERMANENT_FAILURE";

/** Safe, provider-neutral error metadata; provider messages and credentials stay out. */
export class ChannelError extends Error {
  readonly name = "ChannelError";

  constructor(
    readonly code: ChannelErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}
