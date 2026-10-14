/**
 * Runtime-neutral Web Crypto LINE signature verifier, newly authored.
 * Verify HMAC-SHA256 over UNMODIFIED raw bytes.
 * Reference: https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
 */
const base64Hmac = /^[A-Za-z0-9+/]{43}=$/;

export async function verifyLineSignature(
  rawBody: Uint8Array<ArrayBuffer>,
  signature: string | null | undefined,
  channelSecret: string,
): Promise<boolean> {
  if (!signature || !base64Hmac.test(signature) || !channelSecret) return false;
  try {
    const decoded = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0));
    if (decoded.length !== 32) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(channelSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("HMAC", key, decoded, rawBody);
  } catch {
    return false;
  }
}
