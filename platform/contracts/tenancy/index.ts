/** Stable channel identifier used by trusted workspace identity contracts. */
export type ChannelId = "line" | "web";

/**
 * Resolved by trusted server-side connection ownership, never by request data.
 * This context is an identity value; runtime membership/authorization is separate.
 */
export type TrustedWorkspaceContext = Readonly<{
  workspaceId: string;
  connectionId: string;
  channel: ChannelId;
}>;
