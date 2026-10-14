/**
 * A thin LINE reply client informed by line-oa-ai's messaging adapter.
 * No production endpoint uses this yet. No mocked success or credentials.
 */
export interface LineTextMessage { readonly type: "text"; readonly text: string }

export class LineHttpError extends Error {
  constructor(readonly status: number) {
    super("LINE_REPLY_FAILED");
  }
}

export async function sendLineReply(
  input: { accessToken: string; replyToken: string; messages: readonly LineTextMessage[] },
  send: typeof fetch = fetch,
): Promise<void> {
  if (!input.accessToken || !input.replyToken || input.messages.length < 1 || input.messages.length > 5) {
    throw new Error("INVALID_LINE_REPLY_INPUT");
  }
  if (input.messages.some((m) => m.type !== "text" || !m.text || m.text.length > 5000)) {
    throw new Error("INVALID_LINE_MESSAGE");
  }
  const response = await send("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({ replyToken: input.replyToken, messages: input.messages }),
  });
  if (!response.ok) throw new LineHttpError(response.status);
}
